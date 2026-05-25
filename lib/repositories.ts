import { getSupabaseAdmin } from "@/lib/supabase";
import { bangkokDate, monthRange, round2 } from "@/lib/dates";
import { fetchStatementRows, isFailedStatus, normalizeBankStatementRow } from "@/lib/statement";
import type { AuditDetail, CryptoSummaryUntil, JsonRecord, StatementDailyRow, WithdrawCarryoverDetail } from "@/lib/types";

const SUPABASE_PAGE_SIZE = 1000;

async function selectAllPages<T extends JsonRecord>(
  buildQuery: () => ReturnType<ReturnType<typeof getSupabaseAdmin>["from"]> extends infer Builder
    ? Builder extends { select: (...args: never[]) => infer Query }
      ? Query
      : never
    : never,
  label: string
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
  }
  return rows;
}

export async function listStatementDaily(month: string): Promise<StatementDailyRow[]> {
  const { start, end } = monthRange(month);
  const rows = await selectAllPages<StatementDailyRow & JsonRecord>(
    () => getSupabaseAdmin()
      .from("bank_statement_daily")
      .select("*")
      .gte("date", start)
      .lt("date", end)
      .order("date", { ascending: true })
      .order("bank", { ascending: true }),
    "bank_statement_daily"
  );
  if (rows.length) return rows;
  return listStatementDailyFromStatements(month);
}

function summarizeStatementRows(sourceRows: JsonRecord[]): StatementDailyRow[] {
  const map = new Map<string, StatementDailyRow & { lastSortTime: number }>();
  for (const source of sourceRows) {
    const row = normalizeBankStatementRow(source);
    if (!row.date || !row.accountNumber) continue;
    const key = `${row.date}|${row.bank}|${row.accountNumber}`;
    const current = map.get(key) || {
      date: row.date,
      bank: row.bank,
      account_no: row.accountNumber,
      deposit_total: 0,
      withdraw_total: 0,
      fee_total: 0,
      ending_balance: 0,
      failed_amount: 0,
      failed_count: 0,
      lastSortTime: 0
    };
    current.deposit_total += row.deposit;
    current.withdraw_total += row.withdraw + row.fee;
    current.fee_total += row.fee;
    if (row.balance !== null && row.sortTime >= current.lastSortTime) {
      current.ending_balance = row.balance;
      current.lastSortTime = row.sortTime;
    }
    map.set(key, current);
  }
  return Array.from(map.values())
    .map(({ lastSortTime, ...row }) => ({
      ...row,
      deposit_total: round2(row.deposit_total),
      withdraw_total: round2(row.withdraw_total),
      fee_total: round2(row.fee_total),
      ending_balance: round2(row.ending_balance)
    }))
    .sort((a, b) => `${a.date}|${a.bank}|${a.account_no}`.localeCompare(`${b.date}|${b.bank}|${b.account_no}`));
}

export async function listStatementDailyFromStatements(month: string): Promise<StatementDailyRow[]> {
  return summarizeStatementRows(await fetchStatementRows({ month }));
}

export async function listStatementDailyByDate(date: string): Promise<StatementDailyRow[]> {
  const rows = await selectAllPages<StatementDailyRow & JsonRecord>(
    () => getSupabaseAdmin()
      .from("bank_statement_daily")
      .select("*")
      .eq("date", date)
      .order("bank", { ascending: true }),
    "bank_statement_daily"
  );
  if (rows.length) return rows;
  return summarizeStatementRows(await fetchStatementRows({ day: date }));
}

export async function listRowsByMonth<T extends JsonRecord>(table: string, dateColumn: string, month: string): Promise<T[]> {
  const { start, end } = monthRange(month);
  return selectAllPages<T>(
    () => getSupabaseAdmin()
      .from(table)
      .select("*")
      .gte(dateColumn, start)
      .lt(dateColumn, end)
      .order(dateColumn, { ascending: true }),
    table
  );
}

export async function listRowsByDate<T extends JsonRecord>(table: string, dateColumn: string, date: string): Promise<T[]> {
  return selectAllPages<T>(
    () => getSupabaseAdmin()
      .from(table)
      .select("*")
      .eq(dateColumn, date)
      .order(dateColumn, { ascending: false })
      .order("time", { ascending: false })
      .order("created_at", { ascending: false }),
    table
  );
}

export async function listLatestRows<T extends JsonRecord>(table: string, dateColumn: string, limit = 300): Promise<T[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(table)
    .select("*")
    .order(dateColumn, { ascending: false })
    .order("time", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data || []) as T[];
}

export async function listLatestRowsPage<T extends JsonRecord>(
  table: string,
  dateColumn: string,
  page = 1,
  pageSize = 20
): Promise<{ rows: T[]; total: number; page: number; pageSize: number; pageCount: number }> {
  const safePage = Math.max(1, Math.floor(page || 1));
  const safePageSize = Math.min(Math.max(1, Math.floor(pageSize || 20)), 100);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const { data, error, count } = await getSupabaseAdmin()
    .from(table)
    .select("*", { count: "exact" })
    .order(dateColumn, { ascending: false })
    .order("time", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw new Error(`${table}: ${error.message}`);
  const total = count || 0;
  const pageCount = Math.max(1, Math.ceil(total / safePageSize));
  if (total > 0 && safePage > pageCount && !data?.length) {
    return listLatestRowsPage<T>(table, dateColumn, pageCount, safePageSize);
  }
  return {
    rows: (data || []) as T[],
    total,
    page: safePage,
    pageSize: safePageSize,
    pageCount
  };
}

export async function getLatestRowDate(table: string, dateColumn: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(table)
    .select(dateColumn)
    .order(dateColumn, { ascending: false })
    .limit(1);
  if (error) throw new Error(`${table}: ${error.message}`);
  const rows = (data || []) as unknown as JsonRecord[];
  const value = rows[0]?.[dateColumn];
  return value ? String(value).slice(0, 10) : null;
}

export async function listRowsThroughDate<T extends JsonRecord>(table: string, dateColumn: string, date: string): Promise<T[]> {
  return selectAllPages<T>(
    () => getSupabaseAdmin()
      .from(table)
      .select("*")
      .lte(dateColumn, date)
      .order(dateColumn, { ascending: true })
      .order("time", { ascending: true })
      .order("created_at", { ascending: true }),
    table
  );
}

function emptyCryptoSummary(date: string): CryptoSummaryUntil {
  return {
    date,
    buyUsdt: 0,
    buyThb: 0,
    withdrawUsdt: 0,
    withdrawThb: 0,
    transferUsdt: 0,
    transferThb: 0,
    sellUsdt: 0,
    sellThb: 0,
    cumulativeUsdt: 0,
    cumulativeThb: 0,
    count: 0
  };
}

function numberFromRpc(row: JsonRecord, key: string): number {
  return Number(row[key] || 0);
}

function buildCryptoSummaryFromRows(date: string, rows: JsonRecord[]): CryptoSummaryUntil {
  const summary = emptyCryptoSummary(date);
  for (const row of rows) {
    const rowDate = String(row.date || "").slice(0, 10);
    const status = String(row.status || "");
    const usdt = Number(row.usdt || 0);
    const thb = Number(row.amount_thb || 0);
    if (rowDate === date) {
      summary.count += 1;
      if (status === "ซื้อ USDT") {
        summary.buyUsdt = round2(summary.buyUsdt + usdt);
        summary.buyThb = round2(summary.buyThb + thb);
      } else if (status === "ถอน USDT") {
        summary.withdrawUsdt = round2(summary.withdrawUsdt + usdt);
        summary.withdrawThb = round2(summary.withdrawThb + thb);
      } else if (status === "โอน USDT") {
        summary.transferUsdt = round2(summary.transferUsdt + usdt);
        summary.transferThb = round2(summary.transferThb + thb);
      } else if (status === "ขาย USDT") {
        summary.sellUsdt = round2(summary.sellUsdt + usdt);
        summary.sellThb = round2(summary.sellThb + thb);
      }
    }

    if (status === "ซื้อ USDT") {
      summary.cumulativeUsdt = round2(summary.cumulativeUsdt + usdt);
      summary.cumulativeThb = round2(summary.cumulativeThb + thb);
    } else if (status === "ขาย USDT" || status === "ถอน USDT" || status === "โอน USDT") {
      summary.cumulativeUsdt = round2(summary.cumulativeUsdt - usdt);
      summary.cumulativeThb = round2(summary.cumulativeThb - thb);
    }
  }
  return summary;
}

export async function getCryptoSummaryUntil(date: string): Promise<CryptoSummaryUntil> {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : bangkokDate();
  const { data, error } = await getSupabaseAdmin().rpc("crypto_summary_until", { target_date: safeDate });
  if (!error) {
    const row = Array.isArray(data) ? (data[0] as JsonRecord | undefined) : (data as JsonRecord | null);
    if (!row) return emptyCryptoSummary(safeDate);
    return {
      date: safeDate,
      buyUsdt: round2(numberFromRpc(row, "buy_usdt")),
      buyThb: round2(numberFromRpc(row, "buy_thb")),
      withdrawUsdt: round2(numberFromRpc(row, "withdraw_usdt")),
      withdrawThb: round2(numberFromRpc(row, "withdraw_thb")),
      transferUsdt: round2(numberFromRpc(row, "transfer_usdt")),
      transferThb: round2(numberFromRpc(row, "transfer_thb")),
      sellUsdt: round2(numberFromRpc(row, "sell_usdt")),
      sellThb: round2(numberFromRpc(row, "sell_thb")),
      cumulativeUsdt: round2(numberFromRpc(row, "cumulative_usdt")),
      cumulativeThb: round2(numberFromRpc(row, "cumulative_thb")),
      count: numberFromRpc(row, "day_count")
    };
  }

  if (!/function .*crypto_summary_until|schema cache|Could not find|does not exist|PGRST202/i.test(error.message)) {
    throw new Error(`crypto_summary_until: ${error.message}`);
  }
  const rows = await listRowsThroughDate<JsonRecord>("crypto_transactions", "date", safeDate);
  return buildCryptoSummaryFromRows(safeDate, rows);
}

export async function listBalancesThroughMonth(month: string): Promise<JsonRecord[]> {
  const { end } = monthRange(month);
  return selectAllPages<JsonRecord>(
    () => getSupabaseAdmin()
      .from("balances")
      .select("*")
      .lt("date", end)
      .order("date", { ascending: true })
      .order("time", { ascending: true }),
    "balances"
  );
}

export async function listRecentRows<T extends JsonRecord>(table: string, orderColumn = "created_at", limit = 25): Promise<T[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(table)
    .select("*")
    .order(orderColumn, { ascending: false })
    .limit(limit);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data || []) as T[];
}

export async function listSettingsOverview() {
  const [users, bankAccounts, cryptoAccounts, botLogs] = await Promise.all([
    listRecentRows<JsonRecord>("app_users", "created_at", 50),
    listRecentRows<JsonRecord>("bank_accounts", "created_at", 50),
    listRecentRows<JsonRecord>("crypto_accounts", "created_at", 50),
    listRecentRows<JsonRecord>("bot_logs", "created_at", 80)
  ]);
  return { users, bankAccounts, cryptoAccounts, botLogs };
}

export async function listMasterData() {
  const [users, bankAccounts, cryptoAccounts] = await Promise.all([
    listRecentRows<JsonRecord>("app_users", "username", 100),
    listRecentRows<JsonRecord>("bank_accounts", "name", 100),
    listRecentRows<JsonRecord>("crypto_accounts", "name", 100)
  ]);
  return { users, bankAccounts, cryptoAccounts };
}

export async function listRecentEntryFeed(limitPerTable = 8): Promise<JsonRecord[]> {
  const [transfers, crypto, balances, expenses, bogo2pay] = await Promise.all([
    listRecentRows<JsonRecord>("transfers", "created_at", limitPerTable),
    listRecentRows<JsonRecord>("crypto_transactions", "created_at", limitPerTable),
    listRecentRows<JsonRecord>("balances", "created_at", limitPerTable),
    listRecentRows<JsonRecord>("expenses", "created_at", limitPerTable),
    listRecentRows<JsonRecord>("bogo2pay_transactions", "created_at", limitPerTable)
  ]);
  const feed: JsonRecord[] = [
    ...transfers.map((row) => ({ ...row, feed_type: "โยกเงิน", feed_amount: row.amount })),
    ...crypto.map((row) => ({ ...row, feed_type: "คริปโต", feed_amount: row.amount_thb })),
    ...balances.map((row) => ({ ...row, feed_type: "ยอดคงเหลือ", feed_amount: row.amount })),
    ...expenses.map((row) => ({ ...row, feed_type: "รายจ่าย", feed_amount: row.amount })),
    ...bogo2pay.map((row) => ({ ...row, feed_type: "BoAntpay", feed_amount: row.actual_amount }))
  ];
  return feed.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).slice(0, 30);
}

export async function getPayoutFollowupMap(): Promise<Record<string, { status: string; updatedAt: string; user: string; note: string }>> {
  const { data, error } = await getSupabaseAdmin().from("payout_followups").select("*");
  if (error) throw new Error(`payout_followups: ${error.message}`);
  const map: Record<string, { status: string; updatedAt: string; user: string; note: string }> = {};
  for (const row of data || []) {
    const id = String(row.payout_item_id || "").trim();
    if (!id) continue;
    map[id] = {
      status: String(row.followup_status || "pending"),
      updatedAt: row.followup_paid_at || row.updated_at || "",
      user: row.followup_paid_by || "",
      note: row.note || ""
    };
  }
  return map;
}

export async function getFailedPayoutItemsByDate(month: string): Promise<{
  byDate: Record<string, number>;
  byDateCount: Record<string, number>;
  byDatePaid: Record<string, number>;
  byDatePaidCount: Record<string, number>;
  byDatePaidSameDay: Record<string, number>;
  byDatePaidSameDayCount: Record<string, number>;
  byDatePending: Record<string, number>;
  byDatePendingCount: Record<string, number>;
  detailsByDate: Record<string, AuditDetail[]>;
  failedCount: number;
  sourceRows: number;
}> {
  const result = {
    byDate: {} as Record<string, number>,
    byDateCount: {} as Record<string, number>,
    byDatePaid: {} as Record<string, number>,
    byDatePaidCount: {} as Record<string, number>,
    byDatePaidSameDay: {} as Record<string, number>,
    byDatePaidSameDayCount: {} as Record<string, number>,
    byDatePending: {} as Record<string, number>,
    byDatePendingCount: {} as Record<string, number>,
    detailsByDate: {} as Record<string, AuditDetail[]>,
    failedCount: 0,
    sourceRows: 0
  };
  let rows: JsonRecord[] = [];
  try {
    rows = await listRowsByMonth<JsonRecord>("payout_items", "value_date", month);
    result.sourceRows = rows.length;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/payout_items|schema cache|does not exist|Could not find/i.test(message)) return result;
    throw error;
  }
  const followups = await getPayoutFollowupMap();

  for (const row of rows) {
    if (!isFailedStatus(row.status)) continue;
    const date = String(row.value_date || "").slice(0, 10);
    if (!date) continue;
    const amount = Math.abs(Number(row.amount || 0));
    const id = String(row.id || row.uuid || row.payout_item_id || "");
    const followup = followups[id] || { status: "pending", updatedAt: "", user: "", note: "" };
    const isPaid = followup.status === "paid";
    const paidDate = followup.updatedAt ? bangkokDate(new Date(followup.updatedAt)) : "";
    const paidSameDay = isPaid && paidDate === date;
    result.byDate[date] = round2((result.byDate[date] || 0) + amount);
    result.byDateCount[date] = (result.byDateCount[date] || 0) + 1;
    if (isPaid) {
      result.byDatePaid[date] = round2((result.byDatePaid[date] || 0) + amount);
      result.byDatePaidCount[date] = (result.byDatePaidCount[date] || 0) + 1;
      if (paidSameDay) {
        result.byDatePaidSameDay[date] = round2((result.byDatePaidSameDay[date] || 0) + amount);
        result.byDatePaidSameDayCount[date] = (result.byDatePaidSameDayCount[date] || 0) + 1;
      }
    } else {
      result.byDatePending[date] = round2((result.byDatePending[date] || 0) + amount);
      result.byDatePendingCount[date] = (result.byDatePendingCount[date] || 0) + 1;
    }
    result.detailsByDate[date] ||= [];
    result.detailsByDate[date].push({
      id,
      payoutDate: date,
      amount: round2(amount),
      recipientName: String(row.recipient_name || ""),
      recipientAccountNo: String(row.recipient_account_no || ""),
      status: String(row.status || ""),
      followupStatus: followup.status,
      followupPaid: isPaid,
      followupUpdatedAt: followup.updatedAt,
      followupPaidDate: paidDate,
      followupBy: followup.user
    });
    result.failedCount++;
  }

  return result;
}

function mapWithdrawCarryover(row: JsonRecord): WithdrawCarryoverDetail {
  return {
    id: String(row.id || ""),
    boDate: String(row.bo_date || "").slice(0, 10),
    paidDate: String(row.paid_date || "").slice(0, 10),
    amount: Number(row.amount || 0),
    reason: String(row.reason || ""),
    note: String(row.note || ""),
    status: String(row.status || "paid"),
    createdBy: String(row.created_by || "")
  };
}

export async function getWithdrawCarryoversByMonth(month: string): Promise<{
  byBoDate: Record<string, number>;
  byBoDateCount: Record<string, number>;
  byPaidDate: Record<string, number>;
  byPaidDateCount: Record<string, number>;
  detailsByDate: Record<string, WithdrawCarryoverDetail[]>;
}> {
  const result = {
    byBoDate: {} as Record<string, number>,
    byBoDateCount: {} as Record<string, number>,
    byPaidDate: {} as Record<string, number>,
    byPaidDateCount: {} as Record<string, number>,
    detailsByDate: {} as Record<string, WithdrawCarryoverDetail[]>
  };
  let rows: JsonRecord[] = [];
  try {
    const [boRows, paidRows] = await Promise.all([
      listRowsByMonth<JsonRecord>("withdraw_carryovers", "bo_date", month),
      listRowsByMonth<JsonRecord>("withdraw_carryovers", "paid_date", month)
    ]);
    const byId = new Map<string, JsonRecord>();
    for (const row of [...boRows, ...paidRows]) byId.set(String(row.id || `${row.bo_date}:${row.paid_date}:${row.amount}`), row);
    rows = Array.from(byId.values());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/withdraw_carryovers|schema cache|does not exist|Could not find/i.test(message)) return result;
    throw error;
  }

  for (const row of rows) {
    const item = mapWithdrawCarryover(row);
    if (item.status === "cancelled") continue;
    const amount = Math.abs(Number(item.amount || 0));
    if (item.boDate) {
      result.byBoDate[item.boDate] = round2((result.byBoDate[item.boDate] || 0) + amount);
      result.byBoDateCount[item.boDate] = (result.byBoDateCount[item.boDate] || 0) + 1;
      result.detailsByDate[item.boDate] ||= [];
      result.detailsByDate[item.boDate].push(item);
    }
    if (item.paidDate && item.status === "paid") {
      result.byPaidDate[item.paidDate] = round2((result.byPaidDate[item.paidDate] || 0) + amount);
      result.byPaidDateCount[item.paidDate] = (result.byPaidDateCount[item.paidDate] || 0) + 1;
      if (item.paidDate !== item.boDate) {
        result.detailsByDate[item.paidDate] ||= [];
        result.detailsByDate[item.paidDate].push(item);
      }
    }
  }
  return result;
}

export async function saveWithdrawCarryover(input: {
  id?: string;
  boDate: string;
  paidDate: string;
  amount: number;
  reason?: string;
  note?: string;
  status?: string;
  user?: string;
}) {
  const now = new Date().toISOString();
  const payload = {
    bo_date: input.boDate,
    paid_date: input.paidDate,
    amount: Math.abs(Number(input.amount || 0)),
    reason: input.reason || "ธนาคารปิด",
    status: input.status || "paid",
    note: input.note || null,
    created_by: input.user || "admin",
    updated_at: now
  };
  const query = input.id
    ? getSupabaseAdmin().from("withdraw_carryovers").update(payload).eq("id", input.id)
    : getSupabaseAdmin().from("withdraw_carryovers").insert({ ...payload, created_at: now });
  const { data, error } = await query.select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteWithdrawCarryover(id: string) {
  const { error } = await getSupabaseAdmin().from("withdraw_carryovers").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { id };
}

export async function markPayoutFollowupPaid(itemId: string, paid: boolean, user = "admin", paidDate?: string) {
  const now = new Date().toISOString();
  const paidAt = paid && paidDate && /^\d{4}-\d{2}-\d{2}$/.test(paidDate)
    ? new Date(`${paidDate}T12:00:00+07:00`).toISOString()
    : now;
  const payload = {
    payout_item_id: itemId,
    followup_status: paid ? "paid" : "pending",
    followup_paid_at: paid ? paidAt : null,
    followup_paid_by: user,
    note: paid ? `โอนตามแล้ว${paidDate ? ` (${paidDate})` : ""}` : "กลับเป็นค้างโอน",
    updated_at: now
  };
  const { data, error } = await getSupabaseAdmin()
    .from("payout_followups")
    .upsert(payload, { onConflict: "payout_item_id" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
