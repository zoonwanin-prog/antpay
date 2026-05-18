# Task for Claude: Build Monthly Summary and Audit Pages

โปรเจกต์อยู่ที่:

`/Users/taytin/Documents/Codex/Go2payvercel`

ให้ทำหน้า **สรุปรายเดือน** และหน้า **Audit** โดยต้องอ่านต้นฉบับ/โค้ดเดิมก่อนลงมือเสมอ

## สิ่งที่ต้องอ่านก่อน

1. อ่านโครงสร้างโปรเจกต์และ pattern เดิม:
   - `package.json`
   - `app/page.tsx`
   - `app/(admin)/audit/page.tsx`
   - `components/admin-shell.tsx`
   - `app/globals.css`
   - `lib/audit.ts`
   - `lib/dashboard.ts`
   - `lib/repositories.ts`
   - `lib/types.ts`
   - `app/api/audit/route.ts`

2. ดูภาพต้นฉบับที่ผู้ใช้ให้มา:
   - Audit reference: `/Users/taytin/Pictures/Screenshot/SCR-20260518-pdda.png`
   - Monthly summary reference: `/Users/taytin/Pictures/Screenshot/SCR-20260518-pcwv.png`

3. ดู reference ที่มีอยู่ใน repo ด้วย:
   - `audit-desktop.png`
   - `dashboard-desktop.png`
   - `dashboard-desktop-final.png`
   - `dashboard-mobile.png`

## สถานะปัจจุบันที่ต้องรู้

- เป็น Next.js App Router + React Server Components
- ใช้ Supabase ผ่าน `lib/repositories.ts`
- หน้า `/audit` มีอยู่แล้วที่ `app/(admin)/audit/page.tsx`
- เมนูใน `components/admin-shell.tsx` ตอนนี้มี `summary` แต่ยังชี้ไป `/audit` เหมือน `audit`
- `lib/audit.ts` มี `getAuditData(month)` ซึ่งรวมข้อมูลรายวันไว้เยอะแล้ว เช่น bank deposit/withdraw, BO deposit/withdraw, diff bank, diff deposit, diff withdraw, payout followups, transfer/settlement/error/other, buy USDT
- ต้องรักษา pattern เดิมของ `AdminShell`, `MetricCard`, CSS variables และภาษาไทยใน UI

## งานที่ต้องทำ

### 1. สร้างหน้า "สรุปผลประกอบการรายเดือน"

Route ที่ควรทำ:

- `app/(admin)/summary/page.tsx`
- แก้เมนู `summary` ใน `components/admin-shell.tsx` ให้ชี้ไป `/summary`

หน้าต้องอิงภาพ `SCR-20260518-pcwv.png`:

- หัวหน้า: "สรุปผลประกอบการรายเดือน"
- การ์ดสรุปด้านบน 2 ใบ:
  - กำไรรวม: ค่าธรรมเนียม - ค่าธรรมเนียมต้นทุน
  - ยอดโอนเงินรวม: โยก + SETTLE + ซื้อ USDT
- ตัวกรองเดือน ใช้ `<input type="month">` หรือ UI ที่เข้ากับโปรเจกต์เดิม
- ตาราง "ตารางสรุปรายวัน" ตาม reference:
  - วันที่
  - กำไรค่าธรรมเนียม / ค่าธรรมเนียมต้นทุน
  - ฝาก BO / ฝากธนาคาร
  - ถอน BO / ถอนธนาคาร
  - โอนเงินรวม
  - Main-Payout / SafeWallet / Frozen
  - ต้นทุน / คืนทุน
  - เงินในบัญชี / บวกเข้า-บวกถอน
  - รายจ่าย
  - แถวรวมทั้งหมดท้ายตาราง
- ตาราง "ตารางสรุปคริปโตรายวัน" ตาม reference:
  - วันที่
  - ซื้อ USDT
  - ถอน USDT
  - โอน USDT
  - คงเหลือ USDT
  - แถวรวมทั้งหมดท้ายตาราง

ข้อมูลที่ใช้ให้ดึงจากตารางเดิมผ่าน repositories:

- `bogo2pay_transactions`
- `bank_statement_daily`
- `transfers`
- `crypto_transactions`
- `expenses`
- `safewallet` หรือ table ที่ repo ใช้อยู่จริงสำหรับ SafeWallet ถ้ามี
- `balances` สำหรับยอดเงินในบัญชีจริง

ถ้าข้อมูลบางคอลัมน์ใน reference ยังไม่มีใน schema ให้ทำ fallback เป็น 0 และคอมเมนต์สั้น ๆ ในโค้ดเฉพาะจุดที่จำเป็น ห้าม hardcode ตัวเลขจากภาพ

### 2. ปรับหน้า Audit ให้ละเอียดเหมือนต้นฉบับ

หน้า `/audit` ต้องอิงภาพ `SCR-20260518-pdda.png`:

- ชื่อหน้า: "Audit ปิดยอด"
- filter วันที่แบบรายวัน ไม่ใช่เลือกทั้งเดือนอย่างเดียว
- ปุ่ม "โหลด Audit"
- Metric card ด้านบน:
  - ธนาคาร: Diff ธนาคารของวันที่เลือก
  - ฝาก: Diff ฝาก
  - ถอน: Diff ถอน
- กล่องรายละเอียดการคำนวณวันที่เลือก:
  - ธนาคาร
    - เงินตั้งต้น
    - + ฝากธนาคาร
    - - ถอนธนาคาร
    - เงินควรเหลือ
    - เงินในบัญชีจริง
    - Diff ธนาคาร
  - ฝาก
    - ฝากธนาคาร
    - - ฝาก BO
    - Diff ฝาก
  - ถอน
    - ถอน BO ที่ต้องโอนทั้งหมด
    - ถอนไม่สำเร็จ
    - จำนวนรายการไม่สำเร็จ
    - โอนตามแล้ว
    - ค้างโอนตาม
    - ถอนธนาคาร
    - Diff ถอน
    - สรุป Diff ถอนหลังหักยอดอธิบาย
- แยกรายบัญชี:
  - แสดง bank/account แต่ละบัญชี ถ้า data source มีหลายบัญชี
  - ถ้ายัง aggregate อยู่ ให้แสดง aggregate ก่อน แต่ออกแบบให้รองรับหลายบัญชีได้
- ตรวจรายการถอนไม่สำเร็จที่ถูกทับ:
  - ใช้ `failedWithdrawDetails` จาก `lib/audit.ts`
  - แสดง checkbox/สถานะ "ยังโอนไม่สำเร็จ" หรือ "โอนตามแล้ว" ตามข้อมูล followup
  - ถ้าจะทำ interaction mark paid ให้ใช้ pattern API เดิมจาก `app/api/payout-followups/route.ts` ถ้ามีอยู่แล้ว
- รายจ่ายและยอดอ้างอิง:
  - ธุรกรรมจ่าย
  - Fee Statement
  - รายจ่ายรวม
  - โยกเงิน
  - โอน Settlement
  - โอนตามยอด error
  - อื่นๆ
  - ซื้อ USDT
  - รวมยอดอ้างอิง
- ตารางสรุป Diff แต่ละวันด้านล่างยังต้องมีเหมือน reference:
  - วันที่
  - Diff ธนาคาร
  - Diff ฝาก
  - Diff ถอนหลังหักยอดอธิบาย
  - สถานะ

หมายเหตุเรื่อง logic:

- `getAuditData(month)` ตอนนี้คืน rows รายวันครบหลาย field แล้ว ให้ reuse เป็นหลัก
- อาจเพิ่ม helper เช่น `getAuditDayData(date)` หรือใช้ `getAuditData(month)` แล้วเลือก row ตาม date ก็ได้
- ถ้าต้องเพิ่ม field เพื่อแยกรายบัญชี ให้แก้ `lib/audit.ts` และ `lib/types.ts` แบบ backward compatible
- ห้าม hardcode ค่าในภาพ ต้องคำนวณจาก Supabase data

## Design/UX Requirements

- ให้หน้าตาใกล้ reference มากขึ้น แต่ยังกลมกลืนกับ design system ปัจจุบัน
- ใช้ `lucide-react` สำหรับ icon
- ตารางต้องอ่านง่ายบน desktop และไม่พังบน mobile ใช้ horizontal scroll ได้
- หลีกเลี่ยง card ซ้อน card ลึกเกินไป
- ใช้สีเดิมของโปรเจกต์:
  - orange สำหรับ main/accent
  - green สำหรับฝาก/positive
  - red/pink สำหรับ diff/error/withdraw
  - blue/purple สำหรับ crypto/secondary
- ตัวเลขทุกช่องใช้ `Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })`
- วันที่ใน UI ให้แสดง `dd/mm/yyyy` ถ้าทำได้ แต่ query/backend ใช้ `yyyy-mm-dd`

## Verification

หลังแก้ให้รัน:

```bash
npm run typecheck
npm run build
```

ถ้า dev server ใช้งานได้ ให้เปิดตรวจ:

- `/summary`
- `/audit`
- `/audit?date=2026-05-17`
- `/summary?month=2026-05`

ตรวจว่า:

- ไม่มี TypeScript error
- ไม่มี console/server error
- เมนู Summary แยกจาก Audit แล้ว
- หน้า Audit โหลดวันที่ที่เลือกได้
- หน้าสรุปรายเดือนแสดงตารางครบและมีแถวรวม
- layout ไม่ล้น/ทับกันที่ desktop และ mobile

