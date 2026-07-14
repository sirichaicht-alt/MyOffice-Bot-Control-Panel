import express from 'express';
import { executeScraper } from './scripts/github-scraper.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Scraper Web Service is running!');
});

// Endpoint สำหรับให้ cron-job.org มาเรียกเพื่อสั่งรัน scraper
app.get('/run-scraper', async (req, res) => {
  console.log('Received request to run scraper...');
  
  // ให้ response กลับไปก่อนทันที เพื่อไม่ให้ cron-job.org ติด timeout
  res.status(200).send('Scraper background job started.');
  
  // ปล่อยให้มันทำงานใน background
  try {
    await executeScraper();
    console.log('Background scraper job finished successfully.');
  } catch (error) {
    console.error('Background scraper job failed:', error);
  }
});

app.listen(PORT, () => {
  console.log(`Render Server listening on port ${PORT}`);
});
