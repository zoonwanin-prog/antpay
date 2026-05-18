import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { jsonError, jsonOk } from "@/lib/http";

function text(value: unknown) {
  return String(value || "").trim();
}

function hashPassword(password: string) {
  if (!password) return null;
  return `sha256:${createHash("sha256").update(password).digest("hex")}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const kind = text(body.kind);
    const supabase = getSupabaseAdmin();

    if (kind === "bank_account") {
      const name = text(body.name);
      if (!name) return jsonError("กรุณาระบุชื่อบัญชี");
      const { data, error } = await supabase
        .from("bank_accounts")
        .insert({
          name,
          bank: text(body.bank) || null,
          account_no: text(body.account_no) || null,
          account_name: text(body.account_name) || name,
          display_name: text(body.display_name) || name,
          is_active: body.is_active === false ? false : true,
          account_type: text(body.account_type) || "ธนาคาร",
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return jsonOk({ success: true, row: data });
    }

    if (kind === "crypto_account") {
      const name = text(body.name);
      if (!name) return jsonError("กรุณาระบุชื่อบัญชีคริปโต");
      const { data, error } = await supabase
        .from("crypto_accounts")
        .insert({
          name,
          address: text(body.address) || null,
          network: text(body.network) || null,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return jsonOk({ success: true, row: data });
    }

    if (kind === "app_user") {
      const username = text(body.username);
      if (!username) return jsonError("กรุณาระบุ username");
      const { data, error } = await supabase
        .from("app_users")
        .insert({
          username,
          password_hash: hashPassword(text(body.password)),
          role: text(body.role) || "admin",
          updated_at: new Date().toISOString()
        })
        .select("id, username, role, created_at, updated_at")
        .single();
      if (error) throw new Error(error.message);
      return jsonOk({ success: true, row: data });
    }

    return jsonError("Unsupported setting kind");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Settings update failed", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const kind = text(body.kind);
    const id = text(body.id);
    if (!id) return jsonError("Missing setting id");
    const supabase = getSupabaseAdmin();
    const updated_at = new Date().toISOString();

    if (kind === "bank_account") {
      const name = text(body.name);
      if (!name) return jsonError("กรุณาระบุชื่อบัญชี");
      const { data, error } = await supabase
        .from("bank_accounts")
        .update({
          name,
          bank: text(body.bank) || null,
          account_no: text(body.account_no) || null,
          account_name: text(body.account_name) || name,
          display_name: text(body.display_name) || name,
          account_type: text(body.account_type) || "ธนาคาร",
          updated_at
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return jsonOk({ success: true, row: data });
    }

    if (kind === "crypto_account") {
      const name = text(body.name);
      if (!name) return jsonError("กรุณาระบุชื่อบัญชีคริปโต");
      const { data, error } = await supabase
        .from("crypto_accounts")
        .update({
          name,
          address: text(body.address) || null,
          network: text(body.network) || null,
          updated_at
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return jsonOk({ success: true, row: data });
    }

    if (kind === "app_user") {
      const username = text(body.username);
      if (!username) return jsonError("กรุณาระบุ username");
      const payload: Record<string, string | null> = {
        username,
        role: text(body.role) || "admin",
        updated_at
      };
      const password = text(body.password);
      if (password) payload.password_hash = hashPassword(password);
      const { data, error } = await supabase
        .from("app_users")
        .update(payload)
        .eq("id", id)
        .select("id, username, role, created_at, updated_at")
        .single();
      if (error) throw new Error(error.message);
      return jsonOk({ success: true, row: data });
    }

    return jsonError("Unsupported setting kind");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Settings update failed", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const kind = text(body.kind);
    const id = text(body.id);
    if (!id) return jsonError("Missing setting id");
    const tableByKind: Record<string, string> = {
      bank_account: "bank_accounts",
      crypto_account: "crypto_accounts",
      app_user: "app_users"
    };
    const table = tableByKind[kind];
    if (!table) return jsonError("Unsupported setting kind");
    const { error } = await getSupabaseAdmin().from(table).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return jsonOk({ success: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Settings delete failed", 500);
  }
}
