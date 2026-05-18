import { jsonError, jsonOk } from "@/lib/http";
import { listImportHistory, rollbackImport } from "@/lib/statement-import";

function importType(value: unknown): "statement" | "payout" {
  const raw = String(value || "statement").trim();
  return raw === "payout" || raw === "payout_time" || raw === "bulk" || raw === "bulk_payout" ? "payout" : "statement";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = importType(url.searchParams.get("type"));
    const limit = Number(url.searchParams.get("limit") || 8);
    const rows = await listImportHistory(type, limit);
    return jsonOk({ success: true, rows });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Load import history failed", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await rollbackImport({
      importId: body.import_id,
      actor: body.actor || "admin"
    });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Rollback failed", 500);
  }
}
