import { getAuditData } from "@/lib/audit";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const month = new URL(request.url).searchParams.get("month");
    return jsonOk(await getAuditData(month));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Audit failed", 500);
  }
}
