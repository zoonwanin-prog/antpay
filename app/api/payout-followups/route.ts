import { markPayoutFollowupPaid } from "@/lib/repositories";
import { jsonError, jsonOk } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const itemId = String(body.itemId || "").trim();
    const paidDate = String(body.paidDate || "").trim();
    if (!itemId) return jsonError("Missing itemId");
    const row = await markPayoutFollowupPaid(itemId, Boolean(body.paid), body.user || "admin", paidDate);
    return jsonOk({ success: true, row });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Followup update failed", 500);
  }
}
