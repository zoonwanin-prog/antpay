import { jsonError, jsonOk } from "@/lib/http";
import { sendAuditTelegram } from "@/lib/audit-telegram";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const date = String(body.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonError("วันที่ไม่ถูกต้อง");
    const result = await sendAuditTelegram(date);
    return jsonOk({ success: true, result: result.result });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "ส่ง Telegram ไม่สำเร็จ", 500);
  }
}
