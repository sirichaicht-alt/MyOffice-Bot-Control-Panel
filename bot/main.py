import os
import json
import logging
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright
import requests

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load Environment Variables
load_dotenv()

LOGIN_URL = os.getenv('LOGIN_URL')
INBOX_URL = os.getenv('INBOX_URL')
MYOFFICE_USER = os.getenv('MYOFFICE_USER')
MYOFFICE_PASS = os.getenv('MYOFFICE_PASS')
LINE_CHANNEL_ACCESS_TOKEN = os.getenv('LINE_CHANNEL_ACCESS_TOKEN')
LINE_GROUP_ID = os.getenv('LINE_GROUP_ID')

PROCESSED_DOCS_FILE = 'processed_docs.json'

def load_processed_docs():
    """Load the list of already processed document IDs."""
    if not os.path.exists(PROCESSED_DOCS_FILE):
        return []
    try:
        with open(PROCESSED_DOCS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError:
        logger.warning(f"Error decoding {PROCESSED_DOCS_FILE}. Returning empty list.")
        return []

def save_processed_doc(doc_id, processed_docs):
    """Save a new document ID to the processed list."""
    processed_docs.append(doc_id)
    with open(PROCESSED_DOCS_FILE, 'w', encoding='utf-8') as f:
        json.dump(processed_docs, f, ensure_ascii=False, indent=4)

def send_line_notification(doc_id, title, sender):
    """Send a push message to the LINE group."""
    url = "https://api.line.me/v2/bot/message/push"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {LINE_CHANNEL_ACCESS_TOKEN}"
    }
    
    message_text = (
        f"📢 มีหนังสือเข้าใหม่ครับ\n"
        f"🏢 จาก: {sender}\n"
        f"📥 ถึง: ผู้อำนวยการโรงเรียนบ้านลำดวน\n"
        f"📄 เรื่อง: {title}\n"
        f"🔗 เข้าระบบเพื่ออ่าน: {LOGIN_URL}"
    )

    data = {
        "to": LINE_GROUP_ID,
        "messages": [
            {
                "type": "text",
                "text": message_text
            }
        ]
    }

    response = requests.post(url, headers=headers, json=data)
    if response.status_code == 200:
        logger.info(f"Successfully sent LINE notification for document: {doc_id}")
    else:
        logger.error(f"Failed to send LINE notification. Status: {response.status_code}, Error: {response.text}")

def run_scraper():
    """Main function to run the Playwright scraper."""
    processed_docs = load_processed_docs()
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            logger.info("Navigating to login page...")
            page.goto(LOGIN_URL)
            
            # --- LOGIN LOGIC ---
            # Replace these selectors with the actual ones from your website
            logger.info("Logging in...")
            page.fill('input[name="username"]', MYOFFICE_USER) # Example selector
            page.fill('input[name="password"]', MYOFFICE_PASS) # Example selector
            page.click('button[type="submit"]') # Example selector
            
            # Wait for login to complete (e.g., wait for a specific element on the dashboard)
            # page.wait_for_selector('.dashboard-header') 

            logger.info("Navigating to inbox...")
            page.goto(INBOX_URL)
            
            # Wait for the table to load
            logger.info("Waiting for table to load...")
            # page.wait_for_selector('table.inbox-table') # Example selector

            logger.info("Extracting data...")
            # --- DATA EXTRACTION LOGIC ---
            # Find all rows in the table body
            rows = page.locator('table tbody tr') # Example selector
            
            for i in range(rows.count()):
                row = rows.nth(i)
                
                # Column 2: Document ID
                # We use inner_text() and strip() to clean up whitespace
                doc_id = row.locator('td:nth-child(2)').inner_text().strip()
                
                # Column 3: Title
                # If there's a colored square, we might need a more specific selector
                # to get just the text, e.g., 'td:nth-child(3) span.title-text'
                # Or we can just get the whole text, Playwright often handles inner text well
                title = row.locator('td:nth-child(3)').inner_text().strip()
                
                # Column 5: Sender
                sender_raw = row.locator('td:nth-child(5)').inner_text().strip()
                # Simple parsing, might need adjustment based on exact format
                sender = sender_raw.split('โทร')[0].strip() if 'โทร' in sender_raw else sender_raw

                if not doc_id:
                    continue # Skip empty rows if any

                logger.info(f"Found document: {doc_id} - {title}")

                if doc_id not in processed_docs:
                    logger.info(f"New document detected! ID: {doc_id}. Sending notification...")
                    send_line_notification(doc_id, title, sender)
                    save_processed_doc(doc_id, processed_docs)
                else:
                    logger.info(f"Document {doc_id} already processed. Skipping.")

        except Exception as e:
            logger.error(f"An error occurred during scraping: {e}")
        finally:
            browser.close()
            logger.info("Browser closed.")

if __name__ == "__main__":
    run_scraper()
