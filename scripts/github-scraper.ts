import { chromium } from 'playwright';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, addDoc } from "firebase/firestore";

// ใช้ Firebase config เดิม เพื่อบันทึกประวัติว่าเอกสารไหนดึงไปแล้ว จะได้ไม่แจ้งซ้ำ
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
  const message = `แจ้งเตือนหนังสือใหม่!\nเลขที่: ${docId}\nเรื่อง: ${title}\nจาก: ${sender}\n\nกรุณาตรวจสอบในระบบ MyOffice\n${loginUrl}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        to: groupId,
        messages: [{ type: 'text', text: message }]
      })
    });
    return response.ok;
  } catch (error) {
    console.error('Error sending LINE notification:', error);
    return false;
  }
}

async function executeScraper() {
  console.log('Starting GitHub Actions scraper process...');
  
  // ดึงค่าการตั้งค่าต่างๆ จาก GitHub Secrets
  const loginUrl = process.env.LOGIN_URL;
  const inboxUrl = process.env.INBOX_URL;
  const username = process.env.MYOFFICE_USERNAME;
  const password = process.env.MYOFFICE_PASSWORD;
  const lineToken = process.env.LINE_TOKEN;
  const lineGroup = process.env.LINE_GROUP;

  if (!loginUrl || !inboxUrl || !username || !password || !lineToken || !lineGroup) {
    throw new Error('Missing required environment variables. Please check GitHub Secrets.');
  }

  let browser;
  try {
    console.log('Launching headless browser (Playwright)...');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext();
    const page = await context.newPage();
    
    console.log(`Navigating to login page: ${loginUrl}`);
    await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 30000 });

    console.log('Filling login credentials...');
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
      console.log('Submitted login form, navigation complete.');
    } catch (err) {
      console.log('WARNING: Standard login form failed. Trying generic fields...');
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

    console.log(`Navigating to Inbox: ${inboxUrl}`);
    await page.goto(inboxUrl, { waitUntil: 'networkidle', timeout: 30000 });

    console.log('Extracting data from table...');

    const tableData = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      return rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td')).map(td => td.innerText.trim());
        return cells;
      }).filter(cells => cells.length >= 5);
    });

    console.log(`Found ${tableData.length} valid rows in the table.`);

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
          console.log(`New document detected! ID: ${docId}. Sending LINE notification...`);
          const success = await sendLineNotification(docId, title, sender, loginUrl, lineToken, lineGroup);
          if (success) {
            await addDoc(collection(db, "processed_documents"), {
              docId,
              title,
              sender,
              timestamp: new Date().toISOString()
            });
            console.log(`Successfully sent notification for ${docId}`);
          } else {
            console.log(`Failed to send notification for ${docId}`);
          }
        } else {
          // Already processed
        }
      } catch (err: any) {
        console.log(`ERROR processing document ${docId}: ${err.message || err}`);
      }
    }

    console.log('Scraping completed successfully.');

  } catch (error: any) {
    console.error(`ERROR: ${error.message || error}`);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
}

executeScraper().then(() => {
  console.log('Done.');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
