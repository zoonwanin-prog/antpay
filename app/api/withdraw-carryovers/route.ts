import { deleteWithdrawCarryover, saveWithdrawCarryover } from "@/lib/repositories";
import { jsonError, jsonOk } from "@/lib/http";

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const boDate = String(body.boDate || "").trim();
    const paidDate = String(body.paidDate || "").trim();
    const amount = Number(body.amount || 0);
    if (!validDate(boDate)) return jsonError("Missing boDate");
    if (!validDate(paidDate)) return jsonError("Missing paidDate");
    if (!Number.isFinite(amount) || amount <= 0) return jsonError("Missing amount");
    const row = await saveWithdrawCarryover({
      id: String(body.id || "").trim() || undefined,
      boDate,
      paidDate,
      amount,
      reason: String(body.reason || "ธนาคารปิด").trim(),
      note: String(body.note || "").trim(),
      status: String(body.status || "paid").trim(),
      user: String(body.user || "admin").trim()
    });
    return jsonOk({ success: true, row });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Withdraw carryover update failed", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!id) return jsonError("Missing id");
    return jsonOk({ success: true, row: await deleteWithdrawCarryover(id) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Withdraw carryover delete failed", 500);
  }
}
