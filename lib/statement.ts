import { appConfig } from "@/lib/env";
import { bangkokDate, dayRange, monthRange, round2 } from "@/lib/dates";
import { toNumber, toNumberOrNull } from "@/lib/numbers";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { JsonRecord, StatementDailyRow } from "@/lib/types";

type NormalizedStatementRow = {
  date: string;
  time: string;
  bank: string;
  accountNumber: string;
  deposit: number;
  withdraw: number;
  fee: number;
  balance: number | null;
  sortTime: number;
};

function pick(row: JsonRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  }
  const lower = new Map(Object.keys(row).map((key) => [key.toLowerCase(), key]));
  for (const key of keys) {
    const actual = lower.get(key.toLowerCase());
    if (actual && row[actual] !== undefined && row[actual] !== null && row[actual] !== "") return row[actual];
  }
  return "";
}

export function isFailedStatus(status: unknown): boolean {
  return /fail|failed|reject|rejected|cancel|cancelled|error|unsuccess|ไม่สำเร็จ/i.test(String(status || ""));
}

function normalizeDate(value: unknown): string {
  if (!value) return "";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function normalizeTime(value: unknown): string {
  if (!value) return "";
  const text = String(value);
  const match = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}:${match[3] || "00"}`;
}

export function normalizeBankStatementRow(row: JsonRecord): NormalizedStatementRow {
  const dateValue = pick(row, ["date", "statement_date", "transaction_date", "txn_date", "created_at", "createdAt", "timestamp", "datetime", "transferred_at"]);
  const timeValue = pick(row, ["time", "statement_time", "transaction_time", "txn_time"]);
  const type = String(pick(row, ["type", "transaction_type", "direction", "kind", "transaction_kind"]) || "");
  const lowerType = type.toLowerCase();
  const bank = String(pick(row, ["bank", "bank_name", "bank_code", "bankName"]) || "");
  const accountNo = String(pick(row, ["account_no", "account_number", "bank_account_no", "bank_account_number", "bank_account", "account"]) || "");
  const systemAccount = String(pick(row, ["account_id", "system_account", "merchant_id", "merchant"]) || "");
  let amount = toNumber(pick(row, ["amount", "amount_thb", "transaction_amount", "value", "total_amount"]));
  let deposit = toNumber(pick(row, ["deposit", "credit", "amount_in", "deposit_amount", "total_deposit", "total_revenue", "payin_amount", "pay_in_amount"]));
  let withdraw = toNumber(pick(row, ["withdraw", "withdrawal", "debit", "amount_out", "withdraw_amount", "total_withdraw", "total_payout_amount", "payout_amount", "pay_out_amount"]));
  let fee = toNumber(pick(row, ["fee", "fees", "charge", "bank_fee", "statement_fee", "transaction_fee"]));
  const isDepositType = /deposit|payin|pay_in|credit|ฝาก|รับ|\bin\b/.test(lowerType);
  const isWithdrawType = /withdraw|withdrawal|payout|pay_out|debit|ถอน|จ่าย|\bout\b/.test(lowerType);
  const isFeeType = /fee|charge|ค่าธรรมเนียม/.test(lowerType);

  if (amount && !deposit && !withdraw && !fee) {
    if (isFeeType) fee = Math.abs(amount);
    else if (isWithdrawType) withdraw = Math.abs(amount);
    else if (isDepositType) deposit = Math.abs(amount);
    else if (amount < 0) withdraw = Math.abs(amount);
    else deposit = Math.abs(amount);
  }
  if (!fee) {
    fee = toNumber(pick(row, ["total_fee", "deposit_fee", "payin_fee", "pay_in_fee"])) + toNumber(pick(row, ["total_payout_fee", "withdraw_fee", "withdrawal_fee", "payout_fee", "pay_out_fee"]));
  }

  const date = normalizeDate(dateValue);
  const time = normalizeTime(timeValue || dateValue);
  const sortTime = Date.parse(`${date || "1970-01-01"}T${time || "00:00:00"}+07:00`);
  return {
    date,
    time,
    bank,
    accountNumber: accountNo || systemAccount || bank || "ไม่ระบุบัญชี",
    deposit: round2(deposit),
    withdraw: round2(withdraw),
    fee: round2(fee),
    balance: toNumberOrNull(pick(row, ["balance", "running_balance", "remaining_balance", "ending_balance"])),
    sortTime: Number.isNaN(sortTime) ? 0 : sortTime
  };
}

export async function fetchStatementRows(options: { day?: string; month?: string; noDateFilter?: boolean } = {}): Promise<JsonRecord[]> {
  const supabase = getSupabaseAdmin();
  const dateColumn = appConfig.statementsDateColumn;
  const range = options.day ? dayRange(options.day) : monthRange(options.month || bangkokDate().slice(0, 7));
  const rows: JsonRecord[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(appConfig.statementsTable).select("*");
    if (!options.noDateFilter) query = query.gte(dateColumn, range.start).lt(dateColumn, range.end).order(dateColumn, { ascending: true });
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(`Supabase ${appConfig.statementsTable}: ${error.message}`);
    const page = (data || []) as JsonRecord[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

export function buildDailyStatementSummaries(rows: JsonRecord[]): StatementDailyRow[] {
  const map = new Map<string, StatementDailyRow & { lastSortTime: number }>();
  for (const source of rows) {
    const row = normalizeBankStatementRow(source);
    if (!row.date || !row.accountNumber) continue;
    const key = `${row.date}|${row.accountNumber}`;
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
  return Array.from(map.values()).map(({ lastSortTime, ...row }) => ({
    ...row,
    deposit_total: round2(row.deposit_total),
    withdraw_total: round2(row.withdraw_total),
    fee_total: round2(row.fee_total),
    ending_balance: round2(row.ending_balance)
  }));
}

export async function syncStatementDaily(options: { day?: string; month?: string }): Promise<StatementDailyRow[]> {
  const supabase = getSupabaseAdmin();
  const sourceRows = await fetchStatementRows(options);
  const dailyRows = buildDailyStatementSummaries(sourceRows).map((row) => ({
    ...row,
    updated_at: new Date().toISOString()
  }));
  if (!dailyRows.length) return [];
  const { error } = await supabase.from("bank_statement_daily").upsert(dailyRows, {
    onConflict: "date,account_no"
  });
  if (error) throw new Error(`bank_statement_daily upsert failed: ${error.message}`);
  return dailyRows;
}
