import { appConfig } from "@/lib/env";
import { addDays, bangkokDate, bangkokTime, round2 } from "@/lib/dates";
import { notifyEntryCreated } from "@/lib/notifications";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGo2PayAdminToken } from "@/lib/system-settings";
import { sendTelegram, telegramTarget } from "@/lib/telegram";
import type { JsonRecord } from "@/lib/types";

type BotStatus = "success" | "failed";
type SyncCounts = {
  inserted?: number;
  updated?: number;
  scanned?: number;
  skipped?: number;
  error?: string | null;
  durationMs?: number;
  startedAt?: string;
  finishedAt?: string;
};

function inferJob(url: string): string {
  if (url.includes("/tickets")) return "Ticket Bot";
  if (url.includes("/settlements")) return "Settlement Completed";
  if (url.includes("/safe-wallet")) return "SafeWallet Sync";
  if (url.includes("/merchants")) return "Wallet Snapshot";
  if (url.includes("/reports")) return "Daily Report";
  return "Go2Pay Admin API";
}

function numberValue(value: unknown): number {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizeFeePercent(value: unknown): number {
  const number = numberValue(value);
  if (number > 0 && number <= 1) return number * 100;
  return number;
}

function compactDetail(result: Record<string, unknown>): string {
  const detail = JSON.stringify(result, (_key, value) => {
    if (Array.isArray(value) && value.length > 12) return `[${value.length} rows]`;
    return value;
  });
  return detail.length > 1200 ? `${detail.slice(0, 1200)}...` : detail;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatBangkokDateTime(value: unknown): string {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return escapeHtml(value) || "-";
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: appConfig.timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: appConfig.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
  return `${day} ${time}`;
}

function ticketStatusLabel(value: unknown): string {
  const status = String(value || "").trim().toLowerCase();
  if (status === "open") return "เปิด";
  if (status === "closed") return "ปิด";
  if (status === "pending") return "รอดำเนินการ";
  return escapeHtml(value) || "-";
}

function formatTicketMessage(row: JsonRecord): string {
  return [
    "🎫 Ticket เปิดใหม่",
    `Ticket: ${escapeHtml(row.ticket_number) || "-"}`,
    `Merchant: ${escapeHtml(row.merchant) || "-"}`,
    `หมวด: ${escapeHtml(row.category) || "-"}`,
    `หัวข้อ: ${escapeHtml(row.subject) || "-"}`,
    "",
    `สร้างเมื่อ: ${formatBangkokDateTime(row.created_at_source)}`,
    `สถานะ: ${ticketStatusLabel(row.status)}`
  ].join("\n");
}

function syncCounts(result: Record<string, unknown>): Required<Pick<SyncCounts, "inserted" | "updated" | "scanned" | "skipped">> {
  return {
    inserted: numberValue(result.inserted),
    updated: numberValue(result.updated),
    scanned: numberValue(result.scanned || result.sourceRows || result.rows),
    skipped: numberValue(result.skipped)
  };
}

export async function logBot(job: string, status: BotStatus, detail: string, meta: SyncCounts = {}) {
  const now = new Date();
  const { error } = await getSupabaseAdmin().from("bot_logs").insert({
    date: bangkokDate(now),
    time: bangkokTime(now),
    job,
    status,
    detail,
    inserted: numberValue(meta.inserted),
    updated: numberValue(meta.updated),
    scanned: numberValue(meta.scanned),
    skipped: numberValue(meta.skipped),
    error: meta.error || null,
    duration_ms: meta.durationMs ?? null,
    started_at: meta.startedAt || null,
    finished_at: meta.finishedAt || now.toISOString()
  });
  if (error) console.error("bot_logs insert failed", error.message);
}

export async function runLoggedBotJob<T extends Record<string, unknown>>(job: string, callback: () => Promise<T>): Promise<T & { durationMs: number }> {
  const startedAt = new Date();
  try {
    const result = await callback();
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    await logBot(job, "success", compactDetail(result), {
      ...syncCounts(result),
      durationMs,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString()
    });
    return { ...result, durationMs };
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : "Bot sync failed";
    await logBot(job, "failed", message, {
      error: message,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString()
    });
    throw error;
  }
}

export async function fetchGo2Pay<T>(pathOrUrl: string, jobName?: string): Promise<T & { success?: boolean; message?: string }> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${appConfig.go2payApiBase}${pathOrUrl}`;
  const job = jobName || inferJob(url);
  const token = await getGo2PayAdminToken();
  if (!token) {
    const detail = "ไม่พบ Go2Pay Admin Token";
    await sendTelegram(`⚠️ Go2Pay Token ใช้งานไม่ได้\n\nงานที่ล้มเหลว: ${job}\nรายละเอียด: ${detail}`, await telegramTarget("tokenAlert"));
    throw new Error(detail);
  }

  const res = await fetch(url, {
    headers: {
      accept: "application/json, text/plain, */*",
      cookie: `admin_token=${token}`,
      origin: "https://manage.go2pay.tech",
      referer: "https://manage.go2pay.tech/",
      "user-agent": "Mozilla/5.0"
    },
    cache: "no-store"
  });
  if (!res.ok) {
    const text = await res.text();
    const detail = `HTTP ${res.status}: ${text}`;
    if (res.status === 401 || res.status === 403) {
      await sendTelegram(`⚠️ Go2Pay Token หมดอายุ / ใช้งานไม่ได้\n\nงานที่ล้มเหลว: ${job}\nรายละเอียด: Token expired / HTTP ${res.status}`, await telegramTarget("tokenAlert"));
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T & { success?: boolean; message?: string }>;
}

function go2PayHeaders(token: string) {
  return {
    accept: "application/json, text/plain, */*",
    cookie: `admin_token=${token}`,
    origin: "https://manage.go2pay.tech",
    referer: "https://manage.go2pay.tech/",
    "user-agent": "Mozilla/5.0"
  };
}

function go2PayApiRoot() {
  return appConfig.go2payApiBase.replace(/\/admin\/?$/, "");
}

export async function testGo2PayAdminToken(token?: string) {
  const testToken = token || await getGo2PayAdminToken();
  if (!testToken) throw new Error("ไม่พบ Go2Pay Admin Token");
  const endpoints = [
    { label: "Tickets", url: `${appConfig.go2payApiBase}/tickets?limit=1&offset=0` },
    { label: "Settlements", url: `${appConfig.go2payApiBase}/settlements?limit=1&offset=0` },
    { label: "SafeWallet", url: `${appConfig.go2payApiBase}/safe-wallet/transactions?limit=1&offset=0` },
    { label: "Merchants", url: `${go2PayApiRoot()}/merchants` }
  ];
  const results = await Promise.all(endpoints.map(async (endpoint) => {
    const res = await fetch(endpoint.url, {
      headers: go2PayHeaders(testToken),
      cache: "no-store"
    });
    const body = res.ok ? "" : (await res.text()).slice(0, 180);
    return {
      ...endpoint,
      ok: res.ok,
      status: res.status,
      body
    };
  }));
  const authError = results.find((item) => item.status === 401 || item.status === 403);
  if (authError) {
    throw new Error(`Token ไม่ผ่าน: ${authError.label} HTTP ${authError.status}${authError.body ? ` ${authError.body}` : ""}`);
  }
  const failed = results.filter((item) => !item.ok);
  const passed = results.filter((item) => item.ok);
  if (!passed.length) {
    const detail = failed.map((item) => `${item.label} HTTP ${item.status}`).join(", ");
    throw new Error(`ยังไม่มี endpoint ไหนตอบสำเร็จ: ${detail}`);
  }
  return {
    ok: true,
    status: failed.length ? 207 : 200,
    ready: failed.length === 0,
    checks: results.map((item) => `${item.label} HTTP ${item.status}`).join(", "),
    passed: passed.map((item) => item.label).join(", "),
    warnings: failed.map((item) => `${item.label} HTTP ${item.status}`).join(", ")
  };
}

async function upsertWithCounts<Row extends JsonRecord>(
  table: string,
  rows: Row[],
  conflictColumn: keyof Row & string,
  selectColumn = conflictColumn
) {
  if (!rows.length) return { inserted: 0, updated: 0, rows: [] as JsonRecord[], insertedKeys: new Set<string>() };
  const keys = rows.map((row) => String(row[conflictColumn] || "")).filter(Boolean);
  const existing = new Set<string>();
  for (let index = 0; index < keys.length; index += 500) {
    const chunk = keys.slice(index, index + 500);
    const { data, error } = await getSupabaseAdmin().from(table).select(selectColumn).in(selectColumn, chunk as never[]);
    if (error) throw new Error(`${table} existing lookup failed: ${error.message}`);
    for (const row of data || []) existing.add(String((row as JsonRecord)[selectColumn] || ""));
  }
  const { data, error } = await getSupabaseAdmin()
    .from(table)
    .upsert(rows as never[], { onConflict: conflictColumn })
    .select();
  if (error) throw new Error(error.message);
  return {
    inserted: keys.filter((key) => !existing.has(key)).length,
    updated: keys.filter((key) => existing.has(key)).length,
    rows: (data || []) as JsonRecord[],
    insertedKeys: new Set(keys.filter((key) => !existing.has(key)))
  };
}

async function upsertBalancesWithCounts(rows: JsonRecord[]) {
  if (!rows.length) return { inserted: 0, updated: 0, rows: [] as JsonRecord[] };
  const keys = rows.map((row) => `${row.date}|${row.account_name}|${row.balance_type}`);
  const dates = Array.from(new Set(rows.map((row) => String(row.date))));
  const { data: existingRows, error: lookupError } = await getSupabaseAdmin()
    .from("balances")
    .select("date,account_name,balance_type")
    .in("date", dates);
  if (lookupError) throw new Error(`balances existing lookup failed: ${lookupError.message}`);
  const existing = new Set(
    ((existingRows || []) as JsonRecord[]).map((row) => `${String(row.date).slice(0, 10)}|${row.account_name}|${row.balance_type}`)
  );
  const { data, error } = await getSupabaseAdmin()
    .from("balances")
    .upsert(rows, { onConflict: "date,account_name,balance_type" })
    .select();
  if (error) throw new Error(error.message);
  return {
    inserted: keys.filter((key) => !existing.has(key)).length,
    updated: keys.filter((key) => existing.has(key)).length,
    rows: (data || []) as JsonRecord[]
  };
}

export async function syncTickets() {
  const res = await fetchGo2Pay<{ data?: unknown[] }>("/tickets?limit=25&offset=0", "Ticket Bot");
  const items = Array.isArray(res.data) ? res.data as Record<string, unknown>[] : [];
  const openItems = items.filter((item) => String(item.status || "").toLowerCase() === "open");
  if (!openItems.length) return { inserted: 0, updated: 0, scanned: items.length, skipped: items.length };
  const rows = openItems.map((item) => ({
    ticket_id: String(item.id || ""),
    ticket_number: String(item.ticket_number || ""),
    merchant: String((item.merchant as Record<string, unknown> | undefined)?.company_name || (item.merchant as Record<string, unknown> | undefined)?.name || ""),
    merchant_email: String((item.merchant as Record<string, unknown> | undefined)?.email || ""),
    subject: String(item.subject || ""),
    category: String(item.category || ""),
    priority: String(item.priority || ""),
    status: String(item.status || ""),
    created_at_source: item.created_at || null,
    last_reply_at: item.last_reply_at || null,
    last_reply_by: item.last_reply_by_type || "",
    link: `https://manage.go2pay.tech/tickets/${item.id || ""}`,
    notified_at: new Date().toISOString()
  }));
  const result = await upsertWithCounts("bot_tickets", rows, "ticket_id");
  for (const row of result.rows.filter((saved) => result.insertedKeys.has(String(saved.ticket_id || "")))) {
    await sendTelegram(formatTicketMessage(row), await telegramTarget("ticket"));
  }
  return { inserted: result.inserted, updated: result.updated, scanned: items.length, skipped: items.length - openItems.length };
}

export async function syncWalletSnapshot(date = bangkokDate()) {
  const res = await fetchGo2Pay<{ data?: unknown[]; total_frozen?: unknown }>(`${go2PayApiRoot()}/merchants`, "Wallet Snapshot");
  const merchants = Array.isArray(res.data) ? res.data as Record<string, unknown>[] : [];
  let main = 0;
  let payout = 0;
  let safe = 0;
  let frozen = 0;
  for (const merchant of merchants) {
    const wallet = (merchant.wallet || {}) as Record<string, unknown>;
    main += Number(wallet.balance || 0);
    payout += Number(wallet.payout_balance || 0);
    safe += Number(wallet.safe_balance || 0);
    frozen += Number(wallet.frozen || 0);
  }
  frozen = Number(res.total_frozen || frozen);
  const time = bangkokTime();
  const rows = [
    { date, time, account_name: "Main", balance_type: "ระบบ", amount: main, user_name: "cron", note: "" },
    { date, time, account_name: "Payout", balance_type: "ระบบ", amount: payout, user_name: "cron", note: "" },
    { date, time, account_name: "SafeWallet", balance_type: "ระบบ", amount: safe, user_name: "cron", note: "USDT" },
    { date, time, account_name: "Frozen", balance_type: "ระบบ", amount: frozen, user_name: "cron", note: "" }
  ];
  const result = await upsertBalancesWithCounts(rows);
  return { inserted: result.inserted, updated: result.updated, scanned: merchants.length, rows: result.rows.length };
}

async function saveBogo2payRows(rows: JsonRecord[]) {
  let inserted = 0;
  let updated = 0;
  const saved: JsonRecord[] = [];
  const supabase = getSupabaseAdmin();

  for (const row of rows) {
    const { data: existingRows, error: lookupError } = await supabase
      .from("bogo2pay_transactions")
      .select("id")
      .eq("date", row.date)
      .eq("item", row.item)
      .eq("type", row.type)
      .in("user_name", ["auto", "cron"])
      .limit(1);
    if (lookupError) throw new Error(`bogo2pay lookup failed: ${lookupError.message}`);

    const existingId = String((existingRows?.[0] as JsonRecord | undefined)?.id || "");
    if (existingId) {
      const { data, error } = await supabase
        .from("bogo2pay_transactions")
        .update(row)
        .eq("id", existingId)
        .select()
        .single();
      if (error) throw new Error(`bogo2pay update failed: ${error.message}`);
      updated++;
      saved.push((data || {}) as JsonRecord);
    } else {
      const { data, error } = await supabase
        .from("bogo2pay_transactions")
        .insert(row)
        .select()
        .single();
      if (error) throw new Error(`bogo2pay insert failed: ${error.message}`);
      inserted++;
      saved.push((data || {}) as JsonRecord);
    }
  }

  return { inserted, updated, rows: saved };
}

export async function syncBogo2payReports(startDate: string, endDate: string) {
  const rows: JsonRecord[] = [];
  let scanned = 0;
  let skippedFuture = 0;
  let skippedEmpty = 0;
  const today = bangkokDate();
  const safeEndDate = endDate > today ? today : endDate;
  for (let date = startDate; date <= safeEndDate; date = addDays(date, 1)) {
    const res = await fetchGo2Pay<{ data?: { summary?: Record<string, unknown> } }>(
      `/reports?start_date=${date}&end_date=${date}`,
      "BoGo2pay Report"
    );
    const summary = res.data?.summary || {};
    scanned++;
    const revenue = Number(summary.total_revenue || 0);
    const revenueFee = Number(summary.total_fee || 0);
    const payout = Number(summary.total_payout_amount || 0);
    const payoutFee = Number(summary.total_payout_fee || 0);
    if (!revenue && !revenueFee && !payout && !payoutFee) {
      skippedEmpty++;
      continue;
    }
    const time = date === bangkokDate() ? bangkokTime() : "23:55:00";

    rows.push({
      date,
      time,
      item: "Go2Pay",
      type: "ฝาก",
      actual_amount: round2(revenue),
      fee: round2(revenueFee),
      net_amount: round2(revenue - revenueFee),
      note: "Go2Pay report sync",
      user_name: "auto"
    });
    rows.push({
      date,
      time: date === bangkokDate() ? time : "23:56:00",
      item: "Go2Pay",
      type: "ถอน",
      actual_amount: round2(payout),
      fee: round2(payoutFee),
      net_amount: round2(payout - payoutFee),
      note: "Go2Pay report sync",
      user_name: "auto"
    });
  }
  const firstFutureDate = startDate > today ? startDate : addDays(today, 1);
  for (let date = firstFutureDate; date <= endDate; date = addDays(date, 1)) {
    skippedFuture++;
  }

  const result = await saveBogo2payRows(rows);
  return { inserted: result.inserted, updated: result.updated, scanned, skipped: skippedFuture + skippedEmpty, skippedFuture, skippedEmpty, rows: result.rows.length };
}

function firstArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["data", "items", "rows", "results"]) {
      if (Array.isArray(record[key])) return record[key] as Record<string, unknown>[];
    }
    if (record.data && typeof record.data === "object") return firstArray(record.data);
  }
  return [];
}

function sourceDate(value: unknown): string {
  const text = String(value || "");
  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+|T|$)/);
  if (slashMatch) {
    const year = Number(slashMatch[3]) > 2400 ? Number(slashMatch[3]) - 543 : Number(slashMatch[3]);
    return `${year}-${slashMatch[2].padStart(2, "0")}-${slashMatch[1].padStart(2, "0")}`;
  }
  const isoDateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDateMatch) {
    const year = Number(isoDateMatch[1]) > 2400 ? Number(isoDateMatch[1]) - 543 : Number(isoDateMatch[1]);
    if (!text.includes("T")) return `${year}-${isoDateMatch[2]}-${isoDateMatch[3]}`;
  }
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return bangkokDate(date);
  return bangkokDate();
}

function sourceTime(value: unknown): string | null {
  const text = String(value || "");
  const date = new Date(text);
  if (text.includes("T") && !Number.isNaN(date.getTime())) return bangkokTime(date);
  const match = text.match(/(\d{2}:\d{2}(?::\d{2})?)/);
  return match ? (match[1].length === 5 ? `${match[1]}:00` : match[1]) : null;
}

export async function syncCompletedSettlements(startDate: string, endDate: string) {
  const res = await fetchGo2Pay<Record<string, unknown>>(`/settlements?limit=200&offset=0&start_date=${startDate}&end_date=${endDate}`, "Settlement Completed");
  const items = firstArray(res).filter((item) => String(item.status || "").toLowerCase() === "completed");
  const rows = items.map((item) => {
    const completedAt = item.completed_at || item.approved_at || item.created_at;
    const merchant = (item.merchants || item.merchant || {}) as Record<string, unknown>;
    return {
      source_ref: `settlement:${item.id || item.uuid || `${completedAt}:${item.amount}`}`,
      date: sourceDate(completedAt),
      time: sourceTime(completedAt),
      source_account: "Go2pay Wallet",
      status: "โอน USDT",
      target_account: String(merchant.name || merchant.company_name || item.merchant_name || ""),
      amount_thb: Number(item.amount || 0),
      exchange_rate: Number(item.usdt_rate || 0),
      usdt: Number(item.usdt_amount || 0),
      note: "Settlement completed",
      user_name: "cron",
      slip_url: null
    };
  });
  if (!rows.length) return { inserted: 0, updated: 0, scanned: items.length, skipped: 0 };
  const result = await upsertWithCounts("crypto_transactions", rows, "source_ref");
  let notified = 0;
  let notifySkipped = 0;
  for (const row of result.rows.filter((saved) => result.insertedKeys.has(String(saved.source_ref || "")))) {
    try {
      const notifyResult = await notifyEntryCreated("crypto_transactions", row, { mode: "create" });
      if (notifyResult.sent) notified++;
      else notifySkipped++;
    } catch (err) {
      notifySkipped++;
      console.warn(`[settlements] telegram notify failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { inserted: result.inserted, updated: result.updated, scanned: items.length, notified, notifySkipped };
}

export async function syncSafeWalletApprovedDeposits(startDate: string, endDate: string) {
  const rawItems: Record<string, unknown>[] = [];
  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    const res = await fetchGo2Pay<Record<string, unknown>>(`/safe-wallet/transactions?limit=${pageSize}&offset=${offset}&start_date=${startDate}&end_date=${endDate}`, "SafeWallet Sync");
    const page = firstArray(res);
    rawItems.push(...page);
    if (page.length < pageSize) break;
  }
  const items = rawItems.filter((item) => {
    const status = String(item.status || item.transaction_status || item.safe_wallet_status || item.approval_status || "").toLowerCase();
    const type = String(item.transaction_type || item.type || item.kind || "").toLowerCase();
    const createdAt = item.created_at || item.date || item.transaction_date || item.approved_at || item.updated_at;
    const date = sourceDate(createdAt);
    return status === "approved"
      && !["settled", "settle", "completed"].includes(status)
      && (!type || type === "deposit")
      && date >= startDate
      && date <= endDate;
  });
  const rows = items.map((item) => {
    const createdAt = item.created_at || item.date || item.transaction_date || item.approved_at || item.updated_at;
    const merchant = (item.merchant || item.merchants || {}) as Record<string, unknown>;
    const amountThb = Number(item.amount_thb || item.amount || item.usdt_amount || 0);
    const feePercent = normalizeFeePercent(item.fee_percent || item.fee_rate || item.fee || 0);
    const feeAmount = item.fee_amount ? Number(item.fee_amount || 0) : amountThb * feePercent / 100;
    const netThb = item.net_thb || item.net_amount ? Number(item.net_thb || item.net_amount || 0) : amountThb - feeAmount;
    return {
      source_ref: `safewallet:${item.id || item.uuid || `${createdAt}:${item.amount}`}`,
      date: sourceDate(createdAt),
      time: sourceTime(createdAt),
      account_name: String(merchant.name || merchant.company_name || item.merchant_name || ""),
      merchant: String(merchant.name || merchant.company_name || item.merchant_name || ""),
      amount: amountThb,
      amount_thb: amountThb,
      fee_percent: feePercent,
      fee_amount: feeAmount,
      net_thb: netThb,
      user_name: String(item.user_name || item.created_by || item.operator || "cron"),
      status: String(item.status || ""),
      note: "SafeWallet approved deposit",
      created_at_source: createdAt || null
    };
  });
  if (!rows.length) return { inserted: 0, updated: 0, scanned: rawItems.length, skipped: rawItems.length };
  const result = await upsertWithCounts("safewallet_transactions", rows, "source_ref");
  return { inserted: result.inserted, updated: result.updated, scanned: rawItems.length, skipped: rawItems.length - items.length, matched: items.length };
}
