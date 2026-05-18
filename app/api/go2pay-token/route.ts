import { jsonError, jsonOk } from "@/lib/http";
import { getGo2PayTokenStatus, setGo2PayAdminToken } from "@/lib/system-settings";
import { testGo2PayAdminToken } from "@/lib/go2pay";

export async function GET() {
  try {
    return jsonOk({ success: true, ...(await getGo2PayTokenStatus()) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "โหลดสถานะ token ไม่สำเร็จ", 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token || "");
    const result = await testGo2PayAdminToken(token || undefined);
    return jsonOk({ success: true, ...result });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "ทดสอบ Go2Pay API ไม่สำเร็จ", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const token = String(body.token || "").trim();
    if (!token) return jsonError("กรุณากรอก token");
    const result = await testGo2PayAdminToken(token);
    await setGo2PayAdminToken(token);
    return jsonOk({ success: true, ...result, ...(await getGo2PayTokenStatus()) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "บันทึก Go2Pay token ไม่สำเร็จ", 500);
  }
}
