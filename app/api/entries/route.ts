import { getSupabaseAdmin } from "@/lib/supabase";
import { jsonError, jsonOk } from "@/lib/http";
import { notifyEntryCreated } from "@/lib/notifications";

export const runtime = "nodejs";

const allowedTables = new Set(["transfers", "crypto_transactions", "expenses", "balances", "bogo2pay_transactions", "safewallet_transactions"]);
const notifyTables = new Set(["transfers", "crypto_transactions"]);

function shouldNotify(table: string, body: Record<string, unknown>) {
  if (!notifyTables.has(table)) return false;
  // ผู้เรียกสามารถส่ง notify=false เพื่อปิดการแจ้งเตือนเฉพาะรายการนั้น
  return body.notify !== false && body.skip_notify !== true;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const table = String(body.table || "");
    if (!allowedTables.has(table)) return jsonError("Unsupported entry table");
    const { table: _table, notify: _notify, skip_notify: _skip, ...payload } = body;
    const { data, error } = await getSupabaseAdmin().from(table).insert(payload).select().single();
    if (error) throw new Error(error.message);

    let notifyResult: Awaited<ReturnType<typeof notifyEntryCreated>> | null = null;
    if (shouldNotify(table, body)) {
      try {
        notifyResult = await notifyEntryCreated(table, data, { mode: "create" });
      } catch (err) {
        console.warn(`[entries:create] notify failed: ${err instanceof Error ? err.message : String(err)}`);
        notifyResult = { skipped: true, warn: err instanceof Error ? err.message : String(err) };
      }
    }

    return jsonOk({ success: true, row: data, notify: notifyResult });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Entry insert failed", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const table = String(body.table || "");
    const id = String(body.id || "");
    if (!allowedTables.has(table)) return jsonError("Unsupported entry table");
    if (!id) return jsonError("Missing entry id");
    const { table: _table, id: _id, notify: _notify, skip_notify: _skip, ...payload } = body;
    const { data, error } = await getSupabaseAdmin()
      .from(table)
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    let notifyResult: Awaited<ReturnType<typeof notifyEntryCreated>> | null = null;
    // PATCH จะแจ้งเตือนเฉพาะเมื่อ client ขอ (notify: true) เพราะอาจเป็นการแก้ field เล็กน้อย
    if (shouldNotify(table, body) && body.notify === true) {
      try {
        notifyResult = await notifyEntryCreated(table, data, { mode: "update" });
      } catch (err) {
        console.warn(`[entries:update] notify failed: ${err instanceof Error ? err.message : String(err)}`);
        notifyResult = { skipped: true, warn: err instanceof Error ? err.message : String(err) };
      }
    }

    return jsonOk({ success: true, row: data, notify: notifyResult });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Entry update failed", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const table = String(body.table || "");
    const id = String(body.id || "");
    if (!allowedTables.has(table)) return jsonError("Unsupported entry table");
    if (!id) return jsonError("Missing entry id");
    const { error } = await getSupabaseAdmin().from(table).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return jsonOk({ success: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Entry delete failed", 500);
  }
}
