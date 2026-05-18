# Go2payBo Supabase + Vercel Migration

Phase แรกของการย้ายจาก Google Apps Script + Google Sheet ไปเป็น Supabase + Vercel

สิ่งที่ scaffold นี้ทำแล้ว:

- Supabase schema สำหรับ table ที่แทน Sheet หลัก
- service layer สำหรับ audit, statement summary, Go2Pay Admin API, Telegram และ cron jobs
- Next.js App Router API routes สำหรับ dashboard, audit, statement sync, payout followup และ cron
- UI admin เบื้องต้นสำหรับ dashboard, statement, audit และ manual entries
- Google Drive statement tools สำหรับอัปโหลด statement/payout_time และบันทึกประวัติไฟล์ใน Supabase

## Setup

1. ติดตั้ง dependencies

```bash
npm install
```

2. สร้าง `.env.local` จาก `.env.example`

3. รัน migration ใน Supabase SQL editor หรือผ่าน Supabase CLI

```text
supabase/migrations/0001_go2paybo_phase1.sql
supabase/migrations/0002_optional_payout_items.sql
supabase/migrations/0003_import_keys.sql
supabase/migrations/0004_google_drive_uploads.sql
```

4. ตรวจ Supabase Data API settings ให้ schema/table ที่ Vercel server routes ใช้ถูก expose แล้ว โดยเฉพาะโปรเจกต์ใหม่หลัง 28 เม.ย. 2026 ที่ Supabase ไม่ expose table ใหม่อัตโนมัติ

5. รัน dev server

```bash
npm run dev
```

## Cron Security

Cron routes รองรับ `CRON_SECRET` ผ่าน header:

```text
Authorization: Bearer <CRON_SECRET>
```

Vercel Cron เรียกได้โดยไม่ต้องมี header ถ้าไม่ได้ตั้ง `CRON_SECRET` แต่แนะนำให้ตั้งก่อน production

## Google Drive Statement Tools

ตั้งค่า service account ของ Google Cloud แล้วแชร์โฟลเดอร์ Drive ปลายทางให้ email ของ service account ก่อนใช้งาน จากนั้นใส่ env:

```text
GOOGLE_DRIVE_FOLDER_ID=...
GOOGLE_SERVICE_ACCOUNT_JSON=...
```

หรือใช้ `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` แทน JSON ได้ ตาราง `drive_uploads` ใช้เก็บประวัติและลิงก์ไฟล์ที่อัปโหลดจากหน้า `/statements`
