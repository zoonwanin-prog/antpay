# Go2payBo Migration Phase 1

ใช้ไฟล์ handoff เป็น context หลัก:

- `/Users/taytin/Documents/Codex/Go2payBo/โฟลเดอร์ใหม่จากรายการ/GO2PAYBO_HANDOFF_SUPABASE_VERCEL.md`
- `/Users/taytin/Documents/Codex/Go2payBo/โฟลเดอร์ใหม่จากรายการ/SUPABASE_TELEGRAM_MAPPING.md`

## Scope

ย้ายแกนระบบจาก Apps Script + Sheet เป็น Supabase + Vercel พร้อม Google Drive statement tools สำหรับเก็บไฟล์ statement/payout_time

สิ่งที่ทำใน scaffold:

- Sheet หลักถูก map เป็น Supabase tables
- `bank_statement_daily` sync จาก Supabase `statements`
- Audit ใช้ข้อมูลจาก Supabase tables แทน Google Sheet
- `payout_followups` ยังคงเป็น state แยก ไม่แก้ `payout_items.status`
- Telegram token และ chat config ย้ายเป็น env var
- Trigger เดิมถูกแทนด้วย Vercel Cron routes

## Important Rules Preserved

- `statements` ต้องมี `s`
- date column หลักคือ `transaction_date`
- `withdraw_total` ใน `bank_statement_daily` รวม `withdrawal + fee`
- สูตรปิดยอดธนาคารไม่หักรายจ่ายซ้ำ
- `payout_items.status` ห้ามแก้เป็น paid
- Google Drive upload ใช้ service account และบันทึก metadata ใน `drive_uploads`; `slip_url` ยัง nullable สำหรับข้อมูลเก่า

## Next Implementation Steps

1. เชื่อม Supabase project จริงและรัน migration
2. import ข้อมูลจาก Google Sheet เดิมเข้า table ใหม่
3. เติม implementation สำหรับ manual entry POST routes
4. ยืนยัน response shape ของ Go2Pay `/settlements` และ `/safe-wallet/transactions`
5. เปิด auth หน้า admin ก่อน production
