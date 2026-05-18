import { syncStatementDaily } from "@/lib/statement";
import { jsonError, jsonOk } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rows = await syncStatementDaily({ day: body.day, month: body.month });
    return jsonOk({ success: true, rows });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Statement sync failed", 500);
  }
}
