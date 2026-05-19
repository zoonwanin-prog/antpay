import { getSupabaseAdmin } from "@/lib/supabase";
import { jsonError, jsonOk } from "@/lib/http";

type Row = Record<string, any>;

const PAGE_SIZE = 1000;
const FOLLOWUP_CHUNK_SIZE = 100;

function clean(value: string | null) {
  return String(value || "").trim();
}

function normalizeText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[,()%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDate(value: unknown) {
  const text = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function normalizeTime(value: unknown) {
  const text = String(value || "");
  const match = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function money(value: unknown) {
  const n = Number(String(value || "0").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: unknown) {
  return money(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nextMonth(month: string) {
  const [year, rawMonth] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, rawMonth || 1, 1));
  return date.toISOString().slice(0, 10);
}

function isFailedStatus(status: unknown) {
  return /fail|failed|reject|rejected|cancel|cancelled|error|unsuccess|ไม่สำเร็จ/i.test(String(status || ""));
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

async function fetchEveryPage(table: string, build: (from: number, to: number) => any) {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = (data || []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

function mapStatement(row: Row) {
  const withdrawal = money(row.withdrawal);
  const deposit = money(row.deposit);
  const fee = money(row.fee);
  return {
    id: row.statement_id || row.id || row.unique_key,
    statement_id: row.statement_id || "",
    transaction_date: normalizeDate(row.transaction_date),
    transaction_time: normalizeTime(row.transaction_time),
    bank: row.bank || "",
    account_id: row.account_id || "",
    account_no: String(row.account_no || "").replace(/\D/g, ""),
    name_or_description: row.description || "",
    description: row.description || "",
    reference_no: row.reference_no || "",
    source_file_name: row.source_file_name || "",
    withdrawal,
    withdrawal_text: formatMoney(withdrawal),
    deposit,
    deposit_text: formatMoney(deposit),
    fee,
    fee_text: formatMoney(fee),
    amount: money(row.amount || withdrawal || deposit || fee),
    amount_text: formatMoney(row.amount || withdrawal || deposit || fee),
    balance: money(row.balance),
    balance_text: formatMoney(row.balance)
  };
}

function mapPayout(row: Row, followup: Row | undefined) {
  const amount = money(row.amount || row.paid_amount);
  const paidAmount = money(row.paid_amount || row.amount);
  const fee = money(row.fee);
  const followupStatus = String(followup?.followup_status || "pending");
  return {
    id: row.payout_item_id || row.id,
    payout_item_id: String(row.payout_item_id || row.id || ""),
    date: normalizeDate(row.transaction_date || row.value_date),
    transaction_date: normalizeDate(row.transaction_date),
    value_date: normalizeDate(row.value_date),
    row_no: String(row.row_no || ""),
    recipient_name: String(row.recipient_name || ""),
    recipient_bank_name: String(row.recipient_bank_name || row.recipient_bank_code || ""),
    recipient_bank_code: String(row.recipient_bank_code || ""),
    recipient_account_no: String(row.recipient_account_no || "").replace(/\D/g, ""),
    payment_name: String(row.payment_name || ""),
    amount,
    amount_text: formatMoney(amount),
    paid_amount: paidAmount,
    paid_amount_text: formatMoney(paidAmount),
    fee,
    fee_text: formatMoney(fee),
    status: String(row.status || ""),
    rejection_reason: String(row.rejection_reason || ""),
    batch_reference: String(row.batch_reference || ""),
    bank_reference_no: String(row.bank_reference_no || ""),
    source_account_no: String(row.source_account_no || "").replace(/\D/g, ""),
    source_account_id: String(row.source_account_id || ""),
    source_file_name: String(row.source_file_name || ""),
    assigned_username: String(row.assigned_username || ""),
    assigned_display_name: String(row.assigned_display_name || ""),
    followup_status: followupStatus,
    followup_paid: followupStatus === "paid",
    followup_paid_at: followup?.followup_paid_at || "",
    followup_paid_by: followup?.followup_paid_by || ""
  };
}

async function followupMapFor(ids: string[]) {
  const supabase = getSupabaseAdmin();
  const map = new Map<string, Row>();
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  for (const idsChunk of chunk(uniqueIds, FOLLOWUP_CHUNK_SIZE)) {
    const { data, error } = await supabase.from("payout_followups").select("*").in("payout_item_id", idsChunk);
    if (error) {
      if (/schema cache|does not exist|Could not find/i.test(error.message)) return map;
      throw new Error(`payout_followups: ${error.message}`);
    }
    for (const row of data || []) map.set(String(row.payout_item_id || ""), row as Row);
  }
  return map;
}

async function searchStatements(url: URL) {
  const q = normalizeText(clean(url.searchParams.get("q")));
  const date = clean(url.searchParams.get("date"));
  const accountId = clean(url.searchParams.get("account_id"));
  const allRows = clean(url.searchParams.get("all")) === "1";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 10), 300);

  if (!date) {
    return {
      rows: [],
      total: 0,
      require_search: true,
      message: "กรุณาเลือกวันที่ก่อนค้นหา Statement"
    };
  }

  const supabase = getSupabaseAdmin();
  if (!q) {
    if (allRows) {
      const sourceRows = await fetchEveryPage("statements", (from, to) => {
        let query = supabase
          .from("statements")
          .select("*")
          .order("transaction_date", { ascending: false })
          .order("transaction_time", { ascending: false })
          .range(from, to);
        query = query.eq("transaction_date", date);
        if (accountId) query = query.eq("account_id", accountId);
        return query;
      });
      return {
        rows: sourceRows.map(mapStatement),
        total: sourceRows.length,
        limit: sourceRows.length
      };
    }
    let query = supabase
      .from("statements")
      .select("*", { count: "exact" })
      .order("transaction_date", { ascending: false })
      .order("transaction_time", { ascending: false })
      .range(0, limit - 1);
    query = query.eq("transaction_date", date);
    if (accountId) query = query.eq("account_id", accountId);
    const { data, error, count } = await query;
    if (error) throw new Error(`statements: ${error.message}`);
    return {
      rows: ((data || []) as Row[]).map(mapStatement),
      total: count || 0,
      limit
    };
  }

  const sourceRows = await fetchEveryPage("statements", (from, to) => {
    let query = supabase
      .from("statements")
      .select("*")
      .order("transaction_date", { ascending: false })
      .order("transaction_time", { ascending: false })
      .range(from, to);
    query = query.eq("transaction_date", date);
    if (accountId) query = query.eq("account_id", accountId);
    return query;
  });

  const filtered = sourceRows.filter((row) => {
    if (!q) return true;
    return normalizeText([
      row.bank,
      row.account_no,
      row.transaction_date,
      row.transaction_time,
      row.withdrawal,
      row.deposit,
      row.fee,
      row.amount,
      row.balance,
      row.description,
      row.reference_no,
      row.source_file_name
    ].join(" ")).includes(q);
  });

  return {
    rows: (allRows ? filtered : filtered.slice(0, limit)).map(mapStatement),
    total: filtered.length,
    limit: allRows ? filtered.length : limit
  };
}

async function searchBulk(url: URL) {
  const q = normalizeText(clean(url.searchParams.get("q")));
  const month = clean(url.searchParams.get("month"));
  const date = clean(url.searchParams.get("date"));
  const accountId = clean(url.searchParams.get("account_id"));
  const reporter = clean(url.searchParams.get("reporter"));
  const status = clean(url.searchParams.get("status")).toLowerCase();
  const allRows = clean(url.searchParams.get("all")) === "1";
  const pageSize = Math.min(Math.max(Number(url.searchParams.get("page_size") || 15), 10), 100);
  const page = Math.max(Number(url.searchParams.get("page") || 1), 1);

  if (!q && !month && !date && !accountId && !reporter && !status) {
    return {
      rows: [],
      total: 0,
      page: 1,
      page_size: pageSize,
      total_pages: 1,
      require_search: true,
      summary: emptyBulkSummary()
    };
  }

  const supabase = getSupabaseAdmin();
  const sourceRows = await fetchEveryPage("payout_items", (from, to) => {
    let query = supabase
      .from("payout_items")
      .select("*")
      .order("transaction_date", { ascending: false, nullsFirst: false })
      .order("value_date", { ascending: false, nullsFirst: false })
      .order("row_no", { ascending: false })
      .range(from, to);
    if (status) query = query.eq("status", status);
    if (accountId) query = query.eq("source_account_id", accountId);
    return query;
  });

  const filtered = sourceRows.filter((row) => {
    const transactionDate = normalizeDate(row.transaction_date);
    const valueDate = normalizeDate(row.value_date);
    if (date && transactionDate !== date && valueDate !== date) return false;
    if (!date && month && transactionDate.slice(0, 7) !== month && valueDate.slice(0, 7) !== month) return false;
    if (reporter && row.assigned_username !== reporter && row.assigned_display_name !== reporter) return false;
    if (!q) return true;
    return normalizeText([
      row.batch_reference,
      row.bank_reference_no,
      row.recipient_name,
      row.recipient_account_no,
      row.recipient_bank_code,
      row.recipient_bank_name,
      row.amount,
      row.paid_amount,
      row.fee,
      row.status,
      row.rejection_reason,
      row.source_file_name,
      row.source_account_no,
      row.assigned_username,
      row.assigned_display_name
    ].join(" ")).includes(q);
  });

  const followups = await followupMapFor(filtered.map((row) => String(row.payout_item_id || row.id || "")));
  const mapped = filtered.map((row) => mapPayout(row, followups.get(String(row.payout_item_id || row.id || ""))));
  const total = mapped.length;
  if (allRows) {
    return {
      rows: mapped,
      total,
      page: 1,
      page_size: total,
      total_pages: 1,
      summary: buildBulkSummary(mapped)
    };
  }
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    rows: mapped.slice(start, start + pageSize),
    total,
    page: currentPage,
    page_size: pageSize,
    total_pages: totalPages,
    summary: buildBulkSummary(mapped)
  };
}

function emptyBulkSummary() {
  return {
    pending_count: 0,
    pending_amount: "0.00",
    paid_count: 0,
    paid_amount: "0.00",
    followup_pending_count: 0,
    followup_pending_amount: "0.00",
    total_amount: "0.00"
  };
}

function buildBulkSummary(rows: Row[]) {
  const failedRows = rows.filter((row) => isFailedStatus(row.status));
  const paidRows = failedRows.filter((row) => row.followup_paid);
  const pendingRows = failedRows.filter((row) => !row.followup_paid);
  return {
    pending_count: failedRows.length,
    pending_amount: formatMoney(failedRows.reduce((sum, row) => sum + money(row.amount), 0)),
    paid_count: paidRows.length,
    paid_amount: formatMoney(paidRows.reduce((sum, row) => sum + money(row.amount), 0)),
    followup_pending_count: pendingRows.length,
    followup_pending_amount: formatMoney(pendingRows.reduce((sum, row) => sum + money(row.amount), 0)),
    total_amount: formatMoney(rows.reduce((sum, row) => sum + money(row.amount), 0))
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = clean(url.searchParams.get("type")) || "statement";
    const result = type === "bulk" || type === "payout" || type === "payout_time"
      ? await searchBulk(url)
      : await searchStatements(url);
    return jsonOk({ success: true, ...result });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Search failed", 500);
  }
}
