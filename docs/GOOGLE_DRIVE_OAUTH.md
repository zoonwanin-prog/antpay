# การตั้งค่า Google Drive (OAuth 2.0)

คู่มือนี้อธิบายวิธีตั้งค่า Google OAuth Client + Google Drive folders เพื่อให้ระบบ Go2payBO อัปโหลดสลิป / Statement / Payout time ไปเก็บที่ Google Drive ของบัญชีผู้ใช้ที่กด "เชื่อม Google Drive" ในหน้า **ตั้งค่าระบบ**

> สรุปสั้น: ทำ 3 ขั้น — (1) สร้าง OAuth Client ที่ Google Cloud, (2) ใส่ ENV + รัน migration, (3) กดปุ่ม "เชื่อม Google Drive" ในหน้าตั้งค่า

---

## 1. สร้าง Project ที่ Google Cloud Console

1. เปิด [https://console.cloud.google.com/](https://console.cloud.google.com/)
2. มุมบนซ้าย กดเลือก project → **New Project**
3. ตั้งชื่อ project เช่น `go2pay-bo` แล้วกด **Create**
4. รอจน Google สร้าง project เสร็จ แล้วกดเข้า project นั้น

## 2. เปิดใช้งาน Google Drive API

1. เมนูซ้าย → **APIs & Services** → **Library**
2. ค้น `Google Drive API` → กดเข้า → **Enable**

## 3. ตั้งค่า OAuth consent screen

1. **APIs & Services** → **OAuth consent screen**
2. เลือก **External** → **Create**
3. ใส่ข้อมูลขั้นต่ำ:
   - App name: `Go2pay BO`
   - User support email: อีเมลของคุณ
   - Developer contact: อีเมลของคุณ
4. กด **Save and Continue**
5. หน้า **Scopes** กด **Add or Remove Scopes** แล้วเพิ่ม:
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/userinfo.email`
6. กด **Save and Continue** ไปจนจบ
7. หน้า **Test users** กด **Add users** → ใส่ Gmail ของคนที่จะกด "เชื่อม Google Drive" (เช่น ตัวคุณเอง + ทีมแอดมิน)
   > ตอน App Status เป็น **Testing** จะให้เฉพาะ test user ที่อยู่ในรายการนี้ login ได้เท่านั้น ถ้าจะให้ผู้ใช้ภายนอกใช้ได้ ต้องกด **Publish App** ตอนหลัง

## 4. สร้าง OAuth Client ID

1. **APIs & Services** → **Credentials**
2. กด **Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `Go2pay BO Web`
5. **Authorized redirect URIs** → กด **Add URI** แล้วใส่:
   - สำหรับ dev (localhost): `http://localhost:3000/api/google/oauth/callback`
   - สำหรับ production (Vercel): `https://your-app.vercel.app/api/google/oauth/callback`
   > ใส่ได้หลายอันพร้อมกัน ใส่ตามจริงที่ deploy
6. กด **Create**
7. Google จะแสดง popup ที่มี **Client ID** และ **Client Secret** — copy เก็บไว้

## 5. สร้าง Folder ใน Google Drive (optional แต่แนะนำ)

1. เปิด [https://drive.google.com/](https://drive.google.com/) ด้วยบัญชี Google ที่จะใช้เก็บไฟล์
2. สร้าง folder 3 อัน:
   - `Go2pay - Slips`
   - `Go2pay - Statements`
   - `Go2pay - Payout Time`
3. กดเข้าแต่ละ folder แล้วดูจาก URL — ส่วนหลัง `/folders/` คือ **Folder ID**
   - ตัวอย่าง URL: `https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz` → Folder ID คือ `1AbCdEfGhIjKlMnOpQrStUvWxYz`
4. copy Folder ID ทั้ง 3 อันเก็บไว้

> ถ้าไม่สร้าง folder แยก ระบบจะอัปเข้า "My Drive" root ของบัญชีนั้นเลย

## 6. ตั้งค่า Environment Variables

ใส่ค่าใน `.env.local` (สำหรับ dev) หรือใน **Vercel → Project → Settings → Environment Variables** (สำหรับ production):

```bash
# OAuth credentials จากขั้นที่ 4
GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxx
GOOGLE_REDIRECT_URI=https://your-app.vercel.app/api/google/oauth/callback

# Folder IDs จากขั้นที่ 5 (เว้นว่างได้ถ้าไม่ต้องการ folder แยก)
GOOGLE_DRIVE_FOLDER_SLIPS=1AbCdEfGhIjKlMnOpQrStUvWxYz
GOOGLE_DRIVE_FOLDER_STATEMENTS=1XxYyZzZzZzZzZzZzZzZzZzZzZz
GOOGLE_DRIVE_FOLDER_PAYOUT_TIME=1PpQqRrSsTtUuVvWwXxYyZzAaBb

# (ทางเลือก) limit ขนาดไฟล์ — default 20MB
GOOGLE_DRIVE_MAX_UPLOAD_BYTES=20971520
```

**ข้อสำคัญ:**
- `GOOGLE_REDIRECT_URI` ต้องตรงกับที่ใส่ใน Google Cloud Console ขั้นที่ 4 เป๊ะๆ (รวม `http`/`https`, ไม่มี slash ท้าย)
- ถ้าเปลี่ยน domain ต้องไป update ทั้งใน Google Cloud Console และใน ENV

## 7. รัน Supabase Migration

ระบบใหม่ต้องมีตาราง 2 ตัวใน Supabase:
- `google_oauth_tokens` — เก็บ access_token / refresh_token
- `google_drive_uploads` — เก็บ metadata ของไฟล์ที่อัปขึ้น Drive

รัน migration ที่ `supabase/migrations/0005_google_oauth.sql` ด้วยวิธีใดวิธีหนึ่ง:

**วิธี 1: Supabase CLI**
```bash
supabase db push
```

**วิธี 2: Copy SQL ไปรันใน Supabase Studio**
1. เปิด [Supabase Dashboard](https://app.supabase.com) → project ของคุณ → **SQL Editor**
2. กด **New query**
3. Copy เนื้อหาจากไฟล์ `supabase/migrations/0005_google_oauth.sql` ทั้งหมด
4. กด **Run**

## 8. กด "เชื่อม Google Drive" ในหน้าเว็บ

1. เปิดเว็บไซต์ → login ด้วย account admin
2. เมนู **ตั้งค่า** → **ตั้งค่าระบบ**
3. มองหา panel **Google Drive (OAuth)** ทางขวา — ดูตรวจสอบว่า ENV ทั้งหมด "พร้อม"
4. กดปุ่ม **เชื่อม Google Drive**
5. Browser จะ redirect ไปหน้า Google → login ด้วยบัญชี Gmail ที่ใส่ไว้ในขั้นที่ 3 (test user)
6. Google จะถามอนุญาตให้แอปเข้าถึง Drive — กด **Allow / อนุญาต**
7. ระบบ redirect กลับมาที่หน้าตั้งค่า พร้อมแสดง "เชื่อม Google Drive สำเร็จ"

> ระบบจะเก็บ `refresh_token` ไว้ใน Supabase ทำให้ครั้งต่อๆ ไปอัปโหลดได้โดยไม่ต้อง login ใหม่จนกว่าจะ revoke

## 9. ลองอัปโหลด

ทดสอบได้ 3 จุด:

| ที่ไหน | folderType ที่ใช้ | folder ปลายทาง |
|---|---|---|
| แนบสลิปในหน้า **โยกเงิน** | `slip` | `GOOGLE_DRIVE_FOLDER_SLIPS` |
| แนบสลิปในหน้า **คริปโต** | `slip` | `GOOGLE_DRIVE_FOLDER_SLIPS` |
| หน้า **อัปโหลด Statement** | `statement` หรือ `payout_time` | `GOOGLE_DRIVE_FOLDER_STATEMENTS` / `GOOGLE_DRIVE_FOLDER_PAYOUT_TIME` |

หลังอัปสำเร็จระบบจะ:
- บันทึก `drive_url` เข้า `transfers.slip_url` / `crypto_transactions.slip_url`
- บันทึก metadata เข้าตาราง `google_drive_uploads` (folder_type, file_name, drive_file_id, drive_url, related_table, related_id, …)
- ตอนคลิก "ดูรูป" ในตาราง จะเปิด Google Drive ขึ้นมา

---

## API Endpoints (สำหรับ dev)

| Method | Path | คำอธิบาย |
|---|---|---|
| GET | `/api/google/oauth/start?return=/settings/system` | เริ่ม OAuth flow, redirect ไป Google |
| GET | `/api/google/oauth/callback` | Google เรียกกลับมา, แลกโค้ดเป็น token, เก็บลง Supabase |
| GET | `/api/google/oauth/status` | คืนสถานะการเชื่อม (connected, email, expiry, …) |
| DELETE | `/api/google/oauth/status` | ลบ token / ยกเลิกการเชื่อม |
| POST | `/api/google-drive/upload` | อัปโหลดไฟล์ — `multipart/form-data` (`file`, `folderType`, `uploaded_by`, `related_table`, `related_id`) |

ตัวอย่าง `curl` upload:
```bash
curl -F "file=@/path/to/slip.jpg" \
     -F "folderType=slip" \
     -F "uploaded_by=admin" \
     https://your-app.vercel.app/api/google-drive/upload
```

ผลลัพธ์:
```json
{
  "success": true,
  "drive_file_id": "1aBcDeFgHi...",
  "drive_url": "https://drive.google.com/file/d/1aBcDeFgHi.../view",
  "file_name": "slip.jpg",
  "mime_type": "image/jpeg",
  "file_size": 245380,
  "folder_type": "slip"
}
```

ถ้ายังไม่ได้กด "เชื่อม Google Drive":
```json
{ "success": false, "message": "กรุณาเชื่อม Google Drive ก่อน" }
```
(HTTP 409)

---

## Troubleshooting

### "redirect_uri_mismatch"
- URI ใน ENV (`GOOGLE_REDIRECT_URI`) ไม่ตรงกับ Authorized redirect URIs ใน Google Cloud Console
- ต้องตรงทุก char รวม protocol (`http` vs `https`), ไม่มี slash ท้าย

### "Access blocked: Go2pay BO has not completed the Google verification process"
- App ยังเป็น **Testing** mode และ Gmail ที่ใช้ login ยังไม่อยู่ใน **Test users**
- เพิ่ม Gmail นั้นใน OAuth consent screen → Test users

### "กรุณาเชื่อม Google Drive ก่อน" (เคยกดเชื่อมไปแล้ว)
- token หายจาก Supabase หรือ refresh_token หมดอายุ (Google จะ revoke ถ้าไม่ได้ใช้ > 6 เดือน)
- กด "เชื่อม Google ใหม่" ในหน้าตั้งค่าระบบ

### "Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI"
- ลืม set ENV หรือลืม restart server (dev) / redeploy (Vercel) หลัง update ENV

### Token หมดอายุไม่ refresh
- ตรวจว่าตอนเชื่อมครั้งแรกใส่ `prompt=consent` + `access_type=offline` (ระบบทำให้แล้ว) ถึงจะได้ refresh_token
- ถ้าใน Supabase ตาราง `google_oauth_tokens` คอลัมน์ `refresh_token` เป็น NULL → ยกเลิกการเชื่อม แล้วเชื่อมใหม่

### อัปโหลดสำเร็จแต่เปิดไฟล์ใน Drive ไม่ได้ (เห็นแต่ไม่ใช่เจ้าของ)
- ระบบจะตั้ง permission `anyone with link → reader` ให้อัตโนมัติ
- ถ้าอยากให้เก็บเป็น private อย่างเดียว แก้ในไฟล์ `lib/google-drive.ts` ส่ง `makeReadable: false` ตอน call `uploadToGoogleDrive`

---

## ความปลอดภัย

- `GOOGLE_CLIENT_SECRET` และ token ทั้งหมด เก็บฝั่ง server เท่านั้น — ไม่ส่งออก browser
- Routes `/api/google-drive/upload` ใช้ SUPABASE_SERVICE_ROLE_KEY เพื่อเขียน token ดังนั้นห้ามเปิด table `google_oauth_tokens` ให้ anon role
- migration ใส่ `enable row level security` ไว้แล้ว และไม่ได้สร้าง anon policy
- ถ้า revoke การเชื่อม สามารถเข้า [https://myaccount.google.com/permissions](https://myaccount.google.com/permissions) แล้ว remove "Go2pay BO" ได้
