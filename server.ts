import express from 'express';
import path from 'path';
import fs from 'fs';
import { chromium } from 'playwright';
import axios from 'axios';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, addDoc } from "firebase/firestore";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyBLP84uLbFzpmhGp0xNa4xiPhlYTVYyfZ0",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "sytems-b2698.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "sytems-b2698",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "sytems-b2698.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "1044005827769",
  appId: process.env.FIREBASE_APP_ID || "1:1044005827769:web:ac5e8a42427a81f09f1768",
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-6BJZ07LFS9"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

async function sendLineNotification(docId: string, title: string, sender: string, loginUrl: string, token: string, groupId: string) {
  const url = "https://api.line.me/v2/bot/message/push";
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  };
  
  const messageText = `📢 มีหนังสือเข้าใหม่ครับ\n🏢 จาก: ${sender}\n📥 ถึง: ผู้อำนวยการโรงเรียนบ้านลำดวน\n📄 เรื่อง: ${title}\n🔗 เข้าระบบเพื่ออ่าน: ${loginUrl}`;

  const data = {
    to: groupId,
    messages: [
      {
        type: "text",
        text: messageText
      }
    ]
  };

  try {
    const response = await axios.post(url, data, { headers });
    return response.status === 200;
  } catch (error: any) {
    console.error('Failed to send LINE notification:', error?.response?.data || error.message);
    return false;
  }
}

let isScraping = false;
let logs: string[] = [];
let autoRunIntervalId: NodeJS.Timeout | null = null;
let isAutoRunning = false;

function addLog(message: string) {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  logs.push(`[${time}] ${message}`);
  if (logs.length > 100) logs.shift(); // Keep last 100 logs
}

async function executeScraper(config: any) {
  if (isScraping) {
    addLog('WARNING: Scraper is already running, skipping this interval.');
    return;
  }
  
  isScraping = true;
  addLog('Starting scraper process...');
  const { loginUrl, inboxUrl, username, password, lineToken, lineGroup } = config;

  let browser;
  try {
    addLog('Launching headless browser (Playwright)...');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext();
    const page = await context.newPage();
    
    addLog(`Navigating to login page: ${loginUrl}`);
    await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 30000 });

    addLog('Filling login credentials...');
    try {
      const userField = await page.locator('input[name="user"], input[name="username"]').first();
      const passField = await page.locator('input[name="pass"], input[name="password"]').first();
      const submitBtn = await page.locator('button[type="submit"], input[type="submit"]').first();

      await userField.fill(username);
      await passField.fill(password);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
        submitBtn.click()
      ]);
      addLog('Submitted login form, navigation complete.');
    } catch (err) {
      addLog('WARNING: Standard login form failed. Trying generic fields...');
      const textInputs = page.locator('input[type="text"]');
      const passInputs = page.locator('input[type="password"]');
      const submitBtns = page.locator('input[type="submit"], button[type="submit"], button');
      
      await textInputs.nth(0).fill(username);
      await passInputs.nth(0).fill(password);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
        submitBtns.nth(0).click()
      ]);
    }

    addLog(`Navigating to Inbox: ${inboxUrl}`);
    await page.goto(inboxUrl, { waitUntil: 'networkidle', timeout: 30000 });

    addLog('Extracting data from table...');

    const tableData = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      return rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td')).map(td => td.innerText.trim());
        return cells;
      }).filter(cells => cells.length >= 5);
    });

    addLog(`Found ${tableData.length} valid rows in the table.`);

    for (let i = 0; i < tableData.length; i++) {
      const row = tableData[i];
      const docId = row[1];
      const title = row[2];
      let senderRaw = row[4];
      let sender = senderRaw.includes('โทร') ? senderRaw.split('โทร')[0].trim() : senderRaw;

      if (!docId || docId === '' || docId.toLowerCase().includes('เลขหนังสือ') || docId.toLowerCase().includes('เลขที่')) {
        continue; 
      }

      try {
        const q = query(collection(db, "processed_documents"), where("docId", "==", docId));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          addLog(`New document detected! ID: ${docId}. Sending LINE notification...`);
          const success = await sendLineNotification(docId, title, sender, loginUrl, lineToken, lineGroup);
          if (success) {
            await addDoc(collection(db, "processed_documents"), {
              docId,
              title,
              sender,
              timestamp: new Date().toISOString()
            });
            addLog(`Successfully sent notification for ${docId}`);
          } else {
            addLog(`Failed to send notification for ${docId}`);
          }
        } else {
          // Already processed
        }
      } catch (err: any) {
        addLog(`ERROR processing document ${docId}: ${err.message || err}`);
      }
    }

    addLog('Scraping completed successfully.');

  } catch (error: any) {
    addLog(`ERROR: ${error.message || error}`);
  } finally {
    if (browser) {
      await browser.close();
      addLog('Browser closed.');
    }
    isScraping = false;
  }
}

app.post('/api/run-scraper', async (req, res) => {
  if (isScraping) {
    return res.status(400).json({ error: 'Scraping is already in progress.' });
  }

  const config = req.body;
  if (!config.loginUrl || !config.inboxUrl || !config.username || !config.password || !config.lineToken || !config.lineGroup) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  logs = []; // Clear old logs for the new manual run
  res.json({ message: 'Scraper started manually' });

  // Run in background
  executeScraper(config);
});

app.post('/api/auto-run/start', (req, res) => {
  const { config, intervalMinutes } = req.body;
  if (!config || !intervalMinutes) {
    return res.status(400).json({ error: 'Missing config or intervalMinutes' });
  }

  if (autoRunIntervalId) {
    clearInterval(autoRunIntervalId);
  }

  isAutoRunning = true;
  logs = [];
  addLog(`Auto-run started. Interval: ${intervalMinutes} minutes.`);
  
  // Run first time immediately
  executeScraper(config);
  
  // Schedule subsequent runs
  autoRunIntervalId = setInterval(() => {
    addLog(`--- Auto-run triggered (${intervalMinutes}m interval) ---`);
    executeScraper(config);
  }, intervalMinutes * 60 * 1000);

  res.json({ message: 'Auto-run started' });
});

app.post('/api/auto-run/stop', (req, res) => {
  if (autoRunIntervalId) {
    clearInterval(autoRunIntervalId);
    autoRunIntervalId = null;
  }
  isAutoRunning = false;
  addLog('Auto-run stopped.');
  res.json({ message: 'Auto-run stopped' });
});

app.get('/api/status', (req, res) => {
  res.json({
    isScraping,
    isAutoRunning,
    logs
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
