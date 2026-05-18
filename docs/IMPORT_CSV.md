# Import CSV/XLSX From Google Sheets

Export แต่ละ Google Sheet เป็น CSV แล้ว import เข้า Supabase ด้วย script นี้

ถ้ามีไฟล์ `.xlsx` ทั้ง workbook แล้ว สามารถ import ได้โดยตรงเช่นกัน

## 1. Run Import-Key Migration

รัน SQL นี้ใน Supabase SQL Editor ก่อน:

```text
supabase/migrations/0003_import_keys.sql
```

## 2. Export CSV หรือใช้ XLSX

จาก Google Sheet เดิม เลือกแต่ละชีทแล้ว export เป็น CSV:

- `ผู้ใช้งาน.csv`
- `บัญชีธนาคาร.csv`
- `บัญชีคริปโต.csv`
- `BotLog.csv`
- `Botticket.csv`
- `โยกเงิน.csv`
- `คริปโต.csv`
- `ยอดคงเหลือ.csv`
- `รายจ่าย.csv`
- `BoGo2pay.csv`
- `bank_statement_daily.csv`
- `payout_items.csv` ถ้ามี
- `safewallet.csv` ถ้ามี

เก็บไว้เช่น:

```text
/Users/taytin/Documents/Codex/Go2payvercel/import-data
```

หรือวาง workbook ไว้ที่:

```text
/Users/taytin/Documents/Codex/Go2payvercel/Go2PayBO.xlsx
```

## 3. Dry Run

```bash
cd /Users/taytin/Documents/Codex/Go2payvercel
npm run import:csv -- --file ./import-data/โยกเงิน.csv --sheet โยกเงิน
```

Dry-run ทั้ง workbook:

```bash
npm run import:csv -- --file ./Go2PayBO.xlsx
```

ถ้า sample row ถูกต้อง ค่อย commit:

```bash
npm run import:csv -- --file ./import-data/โยกเงิน.csv --sheet โยกเงิน --commit
```

หรือ import ทั้ง workbook:

```bash
npm run import:csv -- --file ./Go2PayBO.xlsx --commit
```

หรือ import ทั้งโฟลเดอร์:

```bash
npm run import:csv -- --dir ./import-data --commit
```

## Notes

- script ใช้ `.env.local`
- default เป็น dry-run ถ้าไม่ใส่ `--commit`
- มี `import_key` กัน import ซ้ำ
- `slip_url` import ได้ถ้ามีคอลัมน์ `ลิงก์รูป`
- ไฟล์ statement/payout_time ใหม่อัปโหลดเข้า Google Drive ได้จากหน้า `/statements`; ประวัติไฟล์อยู่ใน table `drive_uploads`
