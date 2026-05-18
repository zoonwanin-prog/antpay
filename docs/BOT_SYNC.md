# Go2Pay Bot Sync

เอกสารนี้สรุปการดึงข้อมูลบอทจาก Go2Pay API / ระบบหลังบ้าน เข้า Supabase พร้อมเงื่อนไขสำคัญของ manual sync, cron sync, logging และการกันข้อมูลซ้ำ

## ภาพรวม Flow

1. ผู้ใช้กดปุ่ม sync ที่หน้า `/settings/system` หรือ Vercel Cron เรียก API route
2. API route เรียก service ใน `lib/go2pay.ts`
3. `fetchGo2Pay()` ยิง request ไปยัง Go2Pay Admin API
4. ข้อมูลที่ได้ถูก normalize เป็น row สำหรับตาราง Supabase
5. บันทึกด้วย `upsert` โดยใช้ key กันซ้ำ เช่น `source_ref`, `ticket_id`, หรือ unique key ของตาราง
6. เขียนผลการทำงานลง `bot_logs`
7. บางงานส่ง Telegram เฉพาะรายการใหม่

ไฟล์หลัก:

- `lib/go2pay.ts` - Go2Pay fetcher, sync functions, logging helper
- `components/bot-operations.tsx` - ปุ่ม manual sync
- `app/api/bot-operations/route.ts` - API สำหรับ manual sync
- `app/api/cron/*/route.ts` - API สำหรับ cron sync
- `components/settings-system-panels.tsx` - แสดง log และสถานะระบบ
- `supabase/migrations/0006_structured_bot_logs.sql` - เพิ่ม structured log fields

## Environment Variables

ต้องตั้งค่าผ่าน `.env.local` หรือ Vercel Environment Variables

| Name | ใช้ทำอะไร | จำเป็น |
| --- | --- | --- |
| `GO2PAY_ADMIN_TOKEN` | token/cookie สำหรับเข้า Go2Pay Admin API | จำเป็นสำหรับ Go2Pay sync |
| `GO2PAY_API_BASE` | base URL ของ Go2Pay API, default คือ `https://api.go2pay.tech/api/admin` | ไม่จำเป็น |
| `SUPABASE_URL` | Supabase project URL | จำเป็น |
| `SUPABASE_SERVICE_ROLE_KEY` | ใช้เขียนข้อมูลจาก server routes | จำเป็น |
| `CRON_SECRET` | ป้องกัน cron endpoint ด้วย `Authorization: Bearer ...` | แนะนำ |
| `TELEGRAM_BOT_TOKEN` | ส่งแจ้งเตือน Telegram | ถ้าต้องการแจ้งเตือน |
| `TELEGRAM_TICKET` | target สำหรับ ticket alert | ถ้าต้องการแจ้งเตือน ticket |
| `TELEGRAM_CRYPTO` | target สำหรับ settlement alert | ถ้าต้องการแจ้งเตือน crypto |
| `TELEGRAM_TOKEN_ALERT` | target สำหรับ token หมดอายุ/ใช้ไม่ได้ | แนะนำ |

ถ้าไม่มี `GO2PAY_ADMIN_TOKEN` งาน sync จะ fail และ log ลง `bot_logs`

## Manual Sync

หน้า `/settings/system` มีปุ่มใน component `BotOperations`

| Action | ปุ่ม | API |
| --- | --- | --- |
| `sync_all` | Sync ทั้งหมด | `POST /api/bot-operations` |
| `tickets` | ดึง Tickets | `POST /api/bot-operations` |
| `safewallet` | Sync SafeWallet | `POST /api/bot-operations` |
| `settlements` | Sync Settlement | `POST /api/bot-operations` |
| `wallet_snapshot` | Wallet Snapshot | `POST /api/bot-operations` |
| `statements` | Sync Statements | `POST /api/bot-operations` |

ตัวอย่าง request:

```bash
curl -X POST https://your-domain.com/api/bot-operations \
  -H "content-type: application/json" \
  -d '{"action":"sync_all"}'
```

## Cron Sync

ตั้ง schedule ใน `vercel.json`

| Route | งาน | Schedule ปัจจุบัน |
| --- | --- | --- |
| `/api/cron/tickets` | ดึง ticket เปิดใหม่ | ทุก 5 นาที |
| `/api/cron/settlements` | ดึง settlement completed | นาทีที่ 10 ของทุกชั่วโมง |
| `/api/cron/safewallet` | ดึง SafeWallet deposit approved | นาทีที่ 15 ของทุกชั่วโมง |
| `/api/cron/statements` | sync statement daily summary | นาทีที่ 5 ของทุกชั่วโมง |
| `/api/cron/wallet-snapshot` | snapshot ยอด wallet | 16:50 UTC ตาม schedule Vercel |
| `/api/cron/daily-audit-summary` | ส่ง audit summary | 02:00 UTC ตาม schedule Vercel |
| `/api/cron/sync-all` | route รวมสำหรับ sync ทุกงาน | มี route แล้ว แต่ยังไม่ได้เพิ่มใน `vercel.json` |

ถ้ามี `CRON_SECRET` ต้องเรียก cron ด้วย header:

```txt
Authorization: Bearer <CRON_SECRET>
```

Vercel Cron จะส่ง authorization ให้ได้ถ้าตั้ง secret ตาม pattern ของโปรเจกต์

## งาน Sync ที่มีอยู่

### Tickets

Function: `syncTickets()`

Source:

```txt
GET /tickets?limit=25&offset=0
```

เงื่อนไข:

- เอาเฉพาะ ticket ที่ `status = open`
- บันทึกลง `bot_tickets`
- กันซ้ำด้วย `ticket_id`
- ส่ง Telegram เฉพาะ ticket ใหม่

ผลลัพธ์ที่ log:

- `scanned` = จำนวน ticket ที่ API ส่งกลับ
- `skipped` = จำนวน ticket ที่ไม่ใช่ open
- `inserted` = ticket ใหม่
- `updated` = ticket ที่มีอยู่แล้วและถูก upsert

### Settlement Completed

Function: `syncCompletedSettlements(startDate, endDate)`

Source:

```txt
GET /settlements?limit=200&offset=0&start_date=<start>&end_date=<end>
```

เงื่อนไข:

- เอาเฉพาะ `status = completed`
- บันทึกลง `crypto_transactions`
- กันซ้ำด้วย `source_ref`
- `source_ref` ใช้รูปแบบ `settlement:<id>`
- ถ้าไม่มี id จะ fallback เป็น `settlement:<completedAt>:<amount>`
- ส่ง Telegram เฉพาะ settlement ใหม่

หมายเหตุ:

- ปัจจุบัน map `status` เป็น `โอน USDT`
- ถ้าต้องการให้ Audit รวมในช่อง `โอน Settlement` อาจต้องยืนยัน mapping status อีกครั้ง

### SafeWallet Approved Deposits

Function: `syncSafeWalletApprovedDeposits(startDate, endDate)`

Source:

```txt
GET /safe-wallet/transactions?limit=200&offset=0&start_date=<start>&end_date=<end>
```

เงื่อนไข:

- เอาเฉพาะ `transaction_type/type = deposit`
- เอาเฉพาะ `status = approved`
- บันทึกลง `safewallet_transactions`
- กันซ้ำด้วย `source_ref`
- `source_ref` ใช้รูปแบบ `safewallet:<id>`
- ถ้าไม่มี id จะ fallback เป็น `safewallet:<createdAt>:<amount>`

### Wallet Snapshot

Function: `syncWalletSnapshot(date)`

Source:

```txt
GET /merchants
```

เงื่อนไข:

- รวมยอดจาก merchant wallet ทุก merchant
- บันทึกลง `balances`
- มี 4 row ต่อวัน:
  - `Main`
  - `Payout`
  - `SafeWallet`
  - `Frozen`
- กันซ้ำด้วย unique key:

```txt
date, account_name, balance_type
```

### Statements

Function: `syncStatementDaily()`

Source:

- อ่านจาก Supabase table ตาม env:
  - `SUPABASE_STATEMENTS_TABLE`
  - `SUPABASE_STATEMENTS_DATE_COLUMN`
  - `SUPABASE_STATEMENTS_ACCOUNT_COLUMN`

Target:

- `bank_statement_daily`

เงื่อนไข:

- สรุปรายวันต่อบัญชี
- กันซ้ำด้วย unique key:

```txt
date, account_no
```

## Bot Logs

ทุกงาน sync ที่ผ่าน `runLoggedBotJob()` จะเขียน log ลง `bot_logs`

Fields หลัก:

| Field | ความหมาย |
| --- | --- |
| `date` | วันที่ log ตาม timezone Bangkok |
| `time` | เวลา log ตาม timezone Bangkok |
| `job` | ชื่องาน เช่น `Manual tickets`, `Cron settlements` |
| `status` | `success` หรือ `failed` |
| `detail` | JSON summary หรือ error message |
| `inserted` | จำนวนรายการใหม่ |
| `updated` | จำนวนรายการที่ upsert ทับของเดิม |
| `scanned` | จำนวนรายการต้นทางที่อ่าน |
| `skipped` | จำนวนรายการที่ไม่เข้าเงื่อนไข |
| `error` | error message ถ้างานล้มเหลว |
| `duration_ms` | เวลาที่ใช้รันงาน |
| `started_at` | เวลาเริ่ม |
| `finished_at` | เวลาจบ |

หน้า `/settings/system` แสดง log ล่าสุดจาก `bot_logs`

## เงื่อนไขกันข้อมูลซ้ำ

ห้าม insert ตรง ๆ ถ้าเป็นข้อมูลจาก source ภายนอก ต้องใช้ key สำหรับ upsert

| ตาราง | Key กันซ้ำ |
| --- | --- |
| `bot_tickets` | `ticket_id` |
| `crypto_transactions` | `source_ref` หรือ `import_key` |
| `safewallet_transactions` | `source_ref` หรือ `import_key` |
| `balances` | `date, account_name, balance_type` หรือ `import_key` |
| `bank_statement_daily` | `date, account_no` หรือ `import_key` |
| `transfers` | `import_key` ถ้า import จากไฟล์/source |
| `expenses` | `import_key` ถ้า import จากไฟล์/source |
| `bogo2pay_transactions` | `import_key` ถ้า import จากไฟล์/source |
| `payout_items` | `id` |

หลักการตั้ง key:

- ถ้า API มี `id` หรือ `uuid` ให้ใช้เป็นแกนของ `source_ref`
- ถ้าไม่มี id ให้ fallback จาก field ที่นิ่ง เช่น `date/time + amount + merchant`
- หลีกเลี่ยง key ที่เกิดจากค่าที่เปลี่ยนได้ เช่น status อย่างเดียว
- ถ้าเป็น import file ให้ใช้ `import_key`

## สิ่งที่ยังควรเพิ่มต่อ

### 1. Payout Items Sync

ตาราง `payout_items` มีอยู่แล้ว และ Audit ใช้ข้อมูลนี้เพื่อคำนวณรายการถอนไม่สำเร็จ/ต้องโอนตาม

ควรเพิ่มเมื่อยืนยัน endpoint ได้แล้ว เช่น:

```txt
GET /payout-items
GET /payouts/items
GET /reports/payout-items
```

ต้องยืนยัน response fields:

- id / uuid
- value date
- amount
- status
- recipient name
- recipient account no

### 2. BoGo2Pay Transactions Sync

ถ้า Go2Pay API มีรายการฝาก/ถอนของ BoGo2Pay ควร sync เข้า `bogo2pay_transactions`

ต้องยืนยัน:

- endpoint
- ประเภทฝาก/ถอน
- fee
- net amount
- source id สำหรับ `source_ref` หรือ `import_key`

### 3. More Exact Inserted/Updated Count

ตอนนี้นับจาก lookup key ก่อน upsert:

- ถ้า key ยังไม่มี = inserted
- ถ้า key มีแล้ว = updated

ข้อดีคืออ่านง่ายและพอใช้สำหรับ dashboard
ข้อจำกัดคือถ้า row เดิมเหมือนเดิมทุกค่า ก็ยังนับเป็น updated เพราะ `upsert` ถูกเรียกซ้ำ

ถ้าต้องการละเอียดขึ้น ต้อง compare payload กับ row เดิมก่อน upsert

## Checklist ก่อนเพิ่ม Sync ใหม่

- ยืนยัน endpoint และ auth สำเร็จ
- ยืนยัน response shape ด้วยตัวอย่างจริง
- เลือก target table
- เลือก key กันซ้ำ: `source_ref`, `import_key`, หรือ unique constraint
- ทำ normalize field ให้ type ตรงกับ Supabase
- ใช้ `upsert` เท่านั้นสำหรับข้อมูลจาก source ภายนอก
- ห่อด้วย `runLoggedBotJob()`
- เพิ่ม manual action ถ้าต้องกดเอง
- เพิ่ม cron route ถ้าต้องรันอัตโนมัติ
- เพิ่ม migration ถ้าต้องเพิ่ม column/index
- รัน `npm run lint`
- รัน `npm run build`
