import { jsonError, jsonOk } from "@/lib/http";
import {
  getStatementDriveAccessPasswordStatus,
  setStatementDriveAccessPassword,
  verifyStatementDriveAccessPassword
} from "@/lib/system-settings";

export async function GET() {
  try {
    return jsonOk({ success: true, ...(await getStatementDriveAccessPasswordStatus()) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "โหลดสถานะรหัสผ่านไม่สำเร็จ", 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body.action || "verify");
    const password = String(body.password || "");
    if (action === "save") {
      await setStatementDriveAccessPassword(password);
      return jsonOk({ success: true, ...(await getStatementDriveAccessPasswordStatus()) });
    }
    const ok = await verifyStatementDriveAccessPassword(password);
    if (!ok) return jsonError("รหัสผ่านไม่ถูกต้อง", 403);
    return jsonOk({ success: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "ตรวจสอบรหัสผ่านไม่สำเร็จ", 500);
  }
}
