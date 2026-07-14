# ใช้ image ของ Playwright ที่มี environment พร้อมสำหรับรัน Chrome/Chromium
FROM mcr.microsoft.com/playwright:v1.44.0-jammy

# กำหนด working directory
WORKDIR /app

# คัดลอก package.json และติดตั้ง dependencies
COPY package*.json ./
RUN npm install

# คัดลอกโค้ดทั้งหมด
COPY . .

# เปิดพอร์ต 3000 สำหรับ Render
EXPOSE 3000

# รัน Render Server (ใช้ tsx เนื่องจากเป็น TypeScript)
CMD ["npx", "tsx", "render-server.ts"]
