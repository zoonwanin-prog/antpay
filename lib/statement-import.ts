import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { syncStatementDaily } from "@/lib/statement";
import type { JsonRecord } from "@/lib/types";

type BankAccount = {
  id: string;
  bank: string;
  account_no: string;
  name: string;
  account_name: string;
  display_name: string;
};

type ParseResult<T> = {
  rows: T[];
  warnings: string[];
  errors: string[];
  accountMismatchCount?: number;
};

type StatementImportRow = {
  statement_id: string;
  bank: string;
  account_id: string;
  account_no: string;
  transaction_date: string | null;
  transaction_time: string | null;
  transaction_type: string;
  withdrawal: number;
  deposit: number;
  fee: number;
  amount: number;
  balance: number | null;
  description: string;
  reference_no: string;
  source_file_id: string;
  source_file_name: string;
  source_file_url: string;
  source_row_no: number;
  unique_key: string;
  uploaded_by: string;
  uploaded_at: string;
};

type PayoutImportRow = {
  id: string;
  payout_item_id: string;
  source_bank: string;
  source_account_id: string;
  source_account_no: string;
  source_account_name: string;
  batch_reference: string;
  bank_reference_no: string;
  payment_name: string;
  transaction_date: string | null;
  value_date: string;
  row_no: string;
  recipient_name: string;
  recipient_bank_code: string;
  recipient_bank_name: string;
  recipient_account_no: string;
  amount: number;
  paid_amount: number;
  fee: number;
  status: string;
  rejection_reason: string;
  source_file_id: string;
  source_file_name: string;
  source_file_url: string;
  unique_key: string;
  import_id: string;
  uploaded_by: string;
  uploaded_at: string;
  updated_at: string;
};

export type DriveFileMeta = {
  drive_file_id: string;
  web_view_link: string;
  file_name: string;
};

export type ImportSummary = {
  success: true;
  import_id: string;
  import_type: "statement" | "payout";
  file_name: string;
  record_count: number;
  processed_count: number;
  inserted_count: number;
  skipped_count: number;
  warnings: string[];
  errors: string[];
  preview: JsonRecord[];
  synced_months?: string[];
};

export type ImportHistoryRow = {
  import_id: string;
  import_type: "statement" | "payout";
  source_file_name: string | null;
  source_file_id: string | null;
  source_file_url: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  record_count: number;
  processed_count: number;
  inserted_count: number;
  skipped_count: number;
};

const PAYOUT_LATEST_HEADERS = [
  "row_no", "exported_at", "company_name", "sub_entity_name", "batch_reference",
  "customer_reference", "customer_hash", "payment_name", "source_account_no",
  "fee_account_no", "transaction_date", "value_date", "bank_reference_no",
  "recipient_name", "recipient_account_no", "recipient_bank_code",
  "recipient_branch_code", "currency", "amount", "invoice_amount", "vat",
  "withholding_tax", "paid_amount", "fee", "fee_charge_type", "status",
  "rejection_reason", "note"
];
const INSERT_BATCH_SIZE = 500;
const ROLLBACK_DELETE_CHUNK_SIZE = 100;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function normalizeHeader(value: unknown) {
  return text(value).toLowerCase().replace(/\s+/g, "").replace(/[()（）]/g, "");
}

function normalizeAccount(value: unknown) {
  return text(value).replace(/^'/, "").replace(/\.0+$/, "").replace(/[^\dA-Za-z]/g, "");
}

function money(value: unknown) {
  const raw = text(value);
  if (!raw || raw === "-") return 0;
  const negative = /^\(.*\)$/.test(raw) || /^-/.test(raw);
  const n = Number.parseFloat(raw.replace(/[,\s฿()]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return round2(negative ? -Math.abs(n) : n);
}

function round2(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function christianYear(value: unknown) {
  let year = Number(value);
  if (year < 100) year += 2000;
  if (year > 2400) year -= 543;
  return year;
}

function dateIso(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const thai = thaiDateTime(raw);
  if (thai.date) return thai.date;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (dmy) {
    const year = christianYear(dmy[3]);
    return `${year}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function timeIso(value: unknown) {
  const match = text(value).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}:${match[3] || "00"}`;
}

function thaiDateTime(value: unknown) {
  const months: Record<string, string> = {
    "ม.ค.": "01",
    "ก.พ.": "02",
    "มี.ค.": "03",
    "เม.ย.": "04",
    "พ.ค.": "05",
    "มิ.ย.": "06",
    "ก.ค.": "07",
    "ส.ค.": "08",
    "ก.ย.": "09",
    "ต.ค.": "10",
    "พ.ย.": "11",
    "ธ.ค.": "12"
  };
  const raw = text(value);
  const match = raw.match(/(\d{1,2})\s+(\S+)\s+(\d{4})\s+-\s+(\d{1,2}:\d{2})(?::(\d{2}))?/);
  if (!match) return { date: null as string | null, time: null as string | null };
  const year = christianYear(match[3]);
  return {
    date: `${year}-${months[match[2]] || "01"}-${match[1].padStart(2, "0")}`,
    time: `${match[4]}:${match[5] || "00"}`
  };
}

function dateTimeIso(value: unknown) {
  const raw = text(value);
  const thai = thaiDateTime(raw);
  if (thai.date || thai.time) return thai;
  const time = timeIso(raw);
  const date = dateIso(raw.replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/, ""));
  return { date, time };
}

function id(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}-${Date.now()}`;
}

function importId() {
  return id("IMP");
}

export function parseCsv(textValue: string): string[][] {
  const textBody = textValue.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < textBody.length; i++) {
    const ch = textBody[i];
    const next = textBody[i + 1];
    if (quoted) {
      if (ch === "\"" && next === "\"") {
        cell += "\"";
        i++;
      } else if (ch === "\"") quoted = false;
      else cell += ch;
    } else if (ch === "\"") quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((cells) => cells.some((value) => text(value)));
}

function headerIndex(headers: string[]) {
  const index = new Map<string, number>();
  headers.forEach((header, i) => index.set(normalizeHeader(header), i));
  return index;
}

function findHeader(index: Map<string, number>, names: string[]) {
  for (const name of names) {
    const found = index.get(normalizeHeader(name));
    if (found !== undefined) return found;
  }
  return -1;
}

function cell(row: string[], index: number) {
  return index >= 0 ? text(row[index]) : "";
}

function detectStatementFileBank(csvText: string): "SCB" | "KTB" | "" {
  const rows = parseCsv(csvText);
  const headers = rows[0] || [];
  const ix = headerIndex(headers);
  const hasScb = findHeader(ix, ["Account Number", "Account No.", "Account No"]) >= 0
    && findHeader(ix, ["Date", "วันที่"]) >= 0
    && findHeader(ix, ["Time", "เวลา"]) >= 0;
  const hasKtb = findHeader(ix, ["เลขที่บัญชี"]) >= 0
    && findHeader(ix, ["วันที่ & เวลา"]) >= 0
    && findHeader(ix, ["คำอธิบายรายการ"]) >= 0;
  if (hasKtb) return "KTB";
  if (hasScb) return "SCB";
  return "";
}

function assertStatementFileMatchesAccount(csvText: string, account: BankAccount, bankFallback: string) {
  const selectedBank = text(account.bank || bankFallback).toUpperCase();
  if (!selectedBank) throw new Error("บัญชีนี้ยังไม่ได้ระบุธนาคาร กรุณาไปตั้งค่า bank ในหน้า บัญชีและ User ก่อน");
  const fileBank = detectStatementFileBank(csvText);
  if (!fileBank) {
    throw new Error("ไม่รู้จักรูปแบบไฟล์ statement: รองรับ SCB และ KTB CSV เท่านั้น");
  }
  if (fileBank !== selectedBank) {
    throw new Error(`เลือกบัญชี ${selectedBank} แต่ไฟล์ที่อัปโหลดเป็น ${fileBank} กรุณาเลือกบัญชีให้ตรงกับไฟล์`);
  }
  return fileBank;
}

function statementAccountMismatchMessage(parsed: ParseResult<StatementImportRow>, account: BankAccount) {
  const selectedAccountNo = normalizeAccount(account.account_no);
  const examples = parsed.warnings.filter((warning) => warning.includes("เลขบัญชีในไฟล์")).slice(0, 5);
  const detail = examples.length ? ` ตัวอย่าง: ${examples.join(" | ")}` : "";
  return `เลขบัญชีในไฟล์ statement ไม่ตรงกับบัญชีที่เลือก ${selectedAccountNo} (${parsed.accountMismatchCount || 0} แถว).${detail}`;
}

function transactionType(withdrawal: number, deposit: number, fee: number, description: string) {
  if (fee > 0 || isFeeText(description)) return "fee";
  if (deposit > 0) return "deposit";
  if (withdrawal > 0) return "withdrawal";
  return "unknown";
}

function isFeeText(value: unknown) {
  const s = text(value);
  return s.includes("ค่าธรรมเนียม") || /^\s*fee\s*$/i.test(s);
}

function isScbFeeRow(code: string, trDescription: string, description: string) {
  return text(code).toUpperCase() === "FE" || isFeeText(trDescription) || isFeeText(description);
}

function statementKey(row: Omit<StatementImportRow, "unique_key">) {
  return [
    row.bank, row.account_no, row.transaction_date, row.transaction_time,
    row.withdrawal, row.deposit, row.fee, row.balance, row.description
  ].join("|");
}

function payoutKey(row: Omit<PayoutImportRow, "id" | "payout_item_id" | "unique_key">) {
  return [
    row.source_bank, row.source_account_no, row.batch_reference, row.bank_reference_no,
    row.transaction_date, row.value_date, row.row_no, row.recipient_account_no,
    row.amount, row.paid_amount, row.fee, row.status
  ].join("|");
}

function normalizePayoutStatus(value: unknown) {
  const s = text(value).toLowerCase();
  if (s === "draft" || s === "darft" || s.includes("ร่าง")) return "draft";
  if (s === "success" || s === "succuess" || (s.includes("สำเร็จ") && !s.includes("ไม่"))) return "success";
  if (s === "failed" || s === "fail" || s.includes("ไม่สำเร็จ") || s.includes("rejected")) return "failed";
  if (s === "pending" || s.includes("รอ")) return "pending";
  return "unknown";
}

function bankNameFromCode(code: unknown) {
  const map: Record<string, string> = {
    "002": "BBL",
    "004": "KBANK",
    "006": "KTB",
    "011": "TTB",
    "014": "SCB",
    "025": "BAY",
    "030": "GSB",
    "033": "GHB",
    "069": "KKP",
    "071": "TISCO",
    "073": "LH BANK"
  };
  const key = text(code);
  return map[key] || key;
}

function inferBank(row: JsonRecord) {
  const explicit = text(row.bank).toUpperCase();
  if (explicit && explicit !== "ไม่ระบุธนาคาร") return explicit;
  const source = [row.display_name, row.account_name, row.name].map(text).join(" ").toUpperCase();
  const found = source.match(/\b(SCB|KTB|KBANK|BBL|TTB|BAY|GSB)\b/);
  return found?.[1] || "";
}

async function loadBankAccounts(): Promise<BankAccount[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("bank_accounts")
    .select("id, bank, account_no, name, account_name, display_name")
    .order("name", { ascending: true });
  if (error) throw new Error(`bank_accounts: ${error.message}`);
  return ((data || []) as JsonRecord[]).map((row) => ({
    id: text(row.id),
    bank: inferBank(row),
    account_no: normalizeAccount(row.account_no),
    name: text(row.name),
    account_name: text(row.account_name),
    display_name: text(row.display_name)
  }));
}

export async function listStatementBankAccounts() {
  return (await loadBankAccounts()).filter((account) => account.account_no);
}

async function loadBankAccount(accountId: string, bankFallback: string): Promise<BankAccount | null> {
  const accounts = await loadBankAccounts();
  const account = accounts.find((row) => row.id === accountId) || null;
  if (!account) return null;
  return { ...account, bank: account.bank || text(bankFallback).toUpperCase() };
}

function parseScbStatementCsv(csvText: string, fileName: string, uploadedBy: string, account: BankAccount): ParseResult<StatementImportRow> {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return { rows: [], warnings: [], errors: ["CSV ไม่มีข้อมูล"], accountMismatchCount: 0 };
  const ix = headerIndex(rows[0]);
  const accountIx = findHeader(ix, ["Account Number", "Account No.", "Account No"]);
  const dateIx = findHeader(ix, ["Date", "วันที่"]);
  const timeIx = findHeader(ix, ["Time", "เวลา"]);
  const withdrawalIx = findHeader(ix, ["Withdrawal", "Debit Amount", "Debit", "ถอน"]);
  const depositIx = findHeader(ix, ["Deposit", "Credit Amount", "Credit", "ฝาก"]);
  const balanceIx = findHeader(ix, ["Outstanding Balance", "Balance", "ยอดเงินคงเหลือ"]);
  const descriptionIx = findHeader(ix, ["Description", "รายละเอียด", "คำอธิบายรายการ"]);
  const trCodeIx = findHeader(ix, ["Tr Code", "TR Code"]);
  const trDescriptionIx = findHeader(ix, ["Tr Description", "TR Description", "Transaction Description"]);
  const missing = [
    [accountIx, "Account Number หรือ Account No."],
    [dateIx, "Date"],
    [timeIx, "Time"],
    [withdrawalIx, "Withdrawal หรือ Debit Amount"],
    [depositIx, "Deposit หรือ Credit Amount"],
    [descriptionIx, "Description"]
  ].filter(([found]) => Number(found) < 0).map(([, label]) => String(label));
  if (missing.length) throw new Error(`SCB CSV ขาดคอลัมน์: ${missing.join(", ")}`);

  const output: StatementImportRow[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  let mismatch = 0;
  const selectedAccountNo = normalizeAccount(account.account_no);
  const uploadedAt = new Date().toISOString();
  rows.slice(1).forEach((row, offset) => {
    const rowNo = offset + 2;
    try {
      const fileAccountNo = normalizeAccount(cell(row, accountIx));
      if (fileAccountNo && fileAccountNo !== selectedAccountNo) {
        mismatch++;
        if (warnings.length < 10) warnings.push(`row ${rowNo}: เลขบัญชีในไฟล์ ${fileAccountNo} ไม่ตรงกับบัญชีที่เลือก ${selectedAccountNo}`);
      }
      let withdrawal = Math.abs(money(cell(row, withdrawalIx)));
      let deposit = Math.abs(money(cell(row, depositIx)));
      const description = cell(row, descriptionIx);
      const trCode = cell(row, trCodeIx).toUpperCase();
      const trDescription = cell(row, trDescriptionIx);
      let fee = 0;
      if (isScbFeeRow(trCode, trDescription, description)) {
        fee = round2(withdrawal || deposit);
        withdrawal = 0;
        deposit = 0;
      }
      const base = {
        statement_id: id("STMT"),
        bank: "SCB",
        account_id: account.id,
        account_no: selectedAccountNo,
        transaction_date: dateIso(cell(row, dateIx)),
        transaction_time: timeIso(cell(row, timeIx)),
        transaction_type: transactionType(withdrawal, deposit, fee, description),
        withdrawal,
        deposit,
        fee,
        amount: deposit > 0 ? deposit : withdrawal,
        balance: balanceIx >= 0 ? money(cell(row, balanceIx)) : null,
        description,
        reference_no: trCode,
        source_file_id: "",
        source_file_name: fileName,
        source_file_url: "",
        source_row_no: rowNo,
        uploaded_by: uploadedBy,
        uploaded_at: uploadedAt
      };
      output.push({ ...base, unique_key: statementKey(base) });
    } catch (error) {
      errors.push(`row ${rowNo}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  return { rows: output, warnings, errors, accountMismatchCount: mismatch };
}

function parseKtbStatementCsv(csvText: string, fileName: string, uploadedBy: string, account: BankAccount): ParseResult<StatementImportRow> {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return { rows: [], warnings: [], errors: ["CSV ไม่มีข้อมูล"], accountMismatchCount: 0 };
  const ix = headerIndex(rows[0]);
  const accountIx = findHeader(ix, ["เลขที่บัญชี"]);
  const dateTimeIx = findHeader(ix, ["วันที่ & เวลา"]);
  const descriptionIx = findHeader(ix, ["คำอธิบายรายการ"]);
  const withdrawalIx = findHeader(ix, ["ถอน"]);
  const depositIx = findHeader(ix, ["ฝาก"]);
  const balanceIx = findHeader(ix, ["ยอดเงินคงเหลือ"]);
  const missing = [
    [accountIx, "เลขที่บัญชี"],
    [dateTimeIx, "วันที่ & เวลา"],
    [descriptionIx, "คำอธิบายรายการ"],
    [withdrawalIx, "ถอน"],
    [depositIx, "ฝาก"],
    [balanceIx, "ยอดเงินคงเหลือ"]
  ].filter(([found]) => Number(found) < 0).map(([, label]) => String(label));
  if (missing.length) throw new Error(`KTB CSV ขาดคอลัมน์: ${missing.join(", ")}`);

  const output: StatementImportRow[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  let mismatch = 0;
  const selectedAccountNo = normalizeAccount(account.account_no);
  const uploadedAt = new Date().toISOString();
  rows.slice(1).forEach((row, offset) => {
    const rowNo = offset + 2;
    try {
      const fileAccountNo = normalizeAccount(cell(row, accountIx));
      if (fileAccountNo && fileAccountNo !== selectedAccountNo) {
        mismatch++;
        if (warnings.length < 10) warnings.push(`row ${rowNo}: เลขบัญชีในไฟล์ ${fileAccountNo} ไม่ตรงกับบัญชีที่เลือก ${selectedAccountNo}`);
      }
      const dt = dateTimeIso(cell(row, dateTimeIx));
      const withdrawal = Math.abs(money(cell(row, withdrawalIx)));
      const deposit = Math.abs(money(cell(row, depositIx)));
      const description = cell(row, descriptionIx);
      const base = {
        statement_id: id("STMT"),
        bank: "KTB",
        account_id: account.id,
        account_no: selectedAccountNo,
        transaction_date: dt.date,
        transaction_time: dt.time,
        transaction_type: transactionType(withdrawal, deposit, 0, description),
        withdrawal,
        deposit,
        fee: 0,
        amount: deposit > 0 ? deposit : withdrawal,
        balance: money(cell(row, balanceIx)),
        description,
        reference_no: "",
        source_file_id: "",
        source_file_name: fileName,
        source_file_url: "",
        source_row_no: rowNo,
        uploaded_by: uploadedBy,
        uploaded_at: uploadedAt
      };
      output.push({ ...base, unique_key: statementKey(base) });
    } catch (error) {
      errors.push(`row ${rowNo}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  return { rows: output, warnings, errors, accountMismatchCount: mismatch };
}

function parsePayoutCsv(csvText: string, fileName: string, uploadedBy: string, importIdValue: string, accounts: BankAccount[], selectedSourceAccount?: BankAccount | null): ParseResult<PayoutImportRow> {
  const rows = parseCsv(csvText);
  if (!rows.length) return { rows: [], warnings: [], errors: ["CSV ไม่มีข้อมูล"] };
  const first = normalizeHeader(rows[0][0]);
  const hasLegacyHeader = first === "source_bank";
  const hasLatestHeader = first === "row_no";
  const ix = hasLegacyHeader ? headerIndex(rows[0]) : new Map<string, number>();
  const startRow = hasLegacyHeader || hasLatestHeader ? 1 : 0;
  const output: PayoutImportRow[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const uploadedAt = new Date().toISOString();

  if (hasLegacyHeader) {
    const required = [
      "source_bank", "source_account_no", "source_account_name", "batch_reference",
      "bank_reference_no", "payment_name", "transaction_date", "value_date",
      "row_no", "recipient_name", "recipient_bank_code", "recipient_bank_name",
      "recipient_account_no", "amount", "paid_amount", "fee", "status", "rejection_reason"
    ];
    const missing = required.filter((header) => !ix.has(normalizeHeader(header)));
    if (missing.length) return { rows: [], warnings: [], errors: [`Payout CSV ขาดคอลัมน์: ${missing.join(", ")}`] };
  }

  rows.slice(startRow).forEach((row, offset) => {
    const rowNo = offset + startRow + 1;
    try {
      if (!row.some((value) => text(value))) return;
      const get = (header: string, latestIndex: number) => hasLegacyHeader ? cell(row, ix.get(normalizeHeader(header)) ?? -1) : cell(row, latestIndex);
      const sourceAccountNo = normalizeAccount(get("source_account_no", PAYOUT_LATEST_HEADERS.indexOf("source_account_no"))) || selectedSourceAccount?.account_no || "";
      const matched = accounts.find((account) => account.account_no && account.account_no === sourceAccountNo) || selectedSourceAccount || null;
      const sourceBank = text(get("source_bank", -1) || matched?.bank).toUpperCase();
      const recipientBankCode = get("recipient_bank_code", PAYOUT_LATEST_HEADERS.indexOf("recipient_bank_code"));
      const recipientAccountNo = normalizeAccount(get("recipient_account_no", PAYOUT_LATEST_HEADERS.indexOf("recipient_account_no")));
      const amount = money(get("amount", PAYOUT_LATEST_HEADERS.indexOf("amount")));
      const paidAmount = money(get("paid_amount", PAYOUT_LATEST_HEADERS.indexOf("paid_amount")));
      const fee = money(get("fee", PAYOUT_LATEST_HEADERS.indexOf("fee")));
      const transactionDate = dateIso(get("transaction_date", PAYOUT_LATEST_HEADERS.indexOf("transaction_date")));
      const valueDate = dateIso(get("value_date", PAYOUT_LATEST_HEADERS.indexOf("value_date"))) || transactionDate;
      const status = normalizePayoutStatus(get("status", PAYOUT_LATEST_HEADERS.indexOf("status")));
      if (!sourceBank) warnings.push(`row ${rowNo}: source_bank ว่าง`);
      if (!sourceAccountNo) warnings.push(`row ${rowNo}: source_account_no ว่าง`);
      if (selectedSourceAccount?.account_no && sourceAccountNo && sourceAccountNo !== selectedSourceAccount.account_no) {
        warnings.push(`row ${rowNo}: source_account_no ${sourceAccountNo} ไม่ตรงกับบัญชี payout ที่เลือก ${selectedSourceAccount.account_no}`);
      }
      if (!recipientAccountNo) warnings.push(`row ${rowNo}: recipient_account_no ว่าง`);
      if (!amount && !paidAmount) warnings.push(`row ${rowNo}: amount/paid_amount เป็น 0 หรือว่าง`);
      if (!transactionDate && !valueDate) warnings.push(`row ${rowNo}: transaction_date/value_date ว่างหรือ format ผิด`);
      if (status === "unknown") warnings.push(`row ${rowNo}: status เป็น unknown`);
      if (!valueDate) return;

      const sourceAccountName = get("source_account_name", -1)
        || get("company_name", PAYOUT_LATEST_HEADERS.indexOf("company_name"))
        || get("sub_entity_name", PAYOUT_LATEST_HEADERS.indexOf("sub_entity_name"))
        || matched?.display_name
        || matched?.account_name
        || matched?.name
        || "";
      const rejection = get("rejection_reason", PAYOUT_LATEST_HEADERS.indexOf("rejection_reason"))
        || get("note", PAYOUT_LATEST_HEADERS.indexOf("note"));
      const base = {
        source_bank: sourceBank,
        source_account_id: matched?.id || "",
        source_account_no: sourceAccountNo,
        source_account_name: sourceAccountName,
        batch_reference: get("batch_reference", PAYOUT_LATEST_HEADERS.indexOf("batch_reference")),
        bank_reference_no: get("bank_reference_no", PAYOUT_LATEST_HEADERS.indexOf("bank_reference_no")),
        payment_name: get("payment_name", PAYOUT_LATEST_HEADERS.indexOf("payment_name")),
        transaction_date: transactionDate,
        value_date: valueDate,
        row_no: get("row_no", PAYOUT_LATEST_HEADERS.indexOf("row_no")) || String(rowNo),
        recipient_name: get("recipient_name", PAYOUT_LATEST_HEADERS.indexOf("recipient_name")),
        recipient_bank_code: recipientBankCode,
        recipient_bank_name: get("recipient_bank_name", -1) || bankNameFromCode(recipientBankCode),
        recipient_account_no: recipientAccountNo,
        amount,
        paid_amount: paidAmount,
        fee,
        status,
        rejection_reason: rejection,
        source_file_id: "",
        source_file_name: fileName,
        source_file_url: "",
        import_id: importIdValue,
        uploaded_by: uploadedBy,
        uploaded_at: uploadedAt,
        updated_at: uploadedAt
      };
      const uniqueKey = payoutKey(base);
      const payoutId = id("PAYOUT");
      output.push({ ...base, id: payoutId, payout_item_id: payoutId, unique_key: uniqueKey });
    } catch (error) {
      errors.push(`row ${rowNo}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  return { rows: output, warnings: warnings.slice(0, 30), errors };
}

async function insertNewRows<T extends { unique_key: string }>(table: string, rows: T[]) {
  if (!rows.length) return { inserted: 0, skipped: 0 };
  const uniqueRows: T[] = [];
  const seenInFile = new Set<string>();
  let skippedInFile = 0;
  for (const row of rows) {
    if (seenInFile.has(row.unique_key)) {
      skippedInFile++;
      continue;
    }
    seenInFile.add(row.unique_key);
    uniqueRows.push(row);
  }
  let inserted = 0;
  for (let i = 0; i < uniqueRows.length; i += INSERT_BATCH_SIZE) {
    const batch = uniqueRows.slice(i, i + INSERT_BATCH_SIZE);
    const { data, error } = await getSupabaseAdmin()
      .from(table)
      .upsert(batch, { onConflict: "unique_key", ignoreDuplicates: true })
      .select("unique_key");
    if (error) throw new Error(`${table}: ${error.message}`);
    inserted += (data || []).length;
  }
  return { inserted, skipped: uniqueRows.length - inserted + skippedInFile };
}

async function recordImportHistory(row: {
  import_id: string;
  import_type: "statement" | "payout";
  source_file_name: string;
  source_file_id: string;
  source_file_url: string;
  uploaded_by: string;
  record_count: number;
  processed_count: number;
  inserted_count: number;
  skipped_count: number;
  warnings: string[];
}) {
  const { error } = await getSupabaseAdmin().from("import_history").upsert(row, { onConflict: "import_id" });
  if (error) throw new Error(`import_history: ${error.message}`);
}

async function recordAudit(action: "upload_statement" | "upload_payout", targetId: string, uploadedBy: string, fileName: string, note: string) {
  const { error } = await getSupabaseAdmin().from("audit_logs").insert({
    actor_username: uploadedBy,
    actor_role: "admin",
    action,
    target_type: action === "upload_statement" ? "statement_file" : "payout_file",
    target_id: targetId,
    old_value: "",
    new_value: fileName,
    note
  });
  if (error) throw new Error(`audit_logs: ${error.message}`);
}

async function recordRollbackAudit(importType: string, importIdValue: string, actor: string, note: string) {
  const { error } = await getSupabaseAdmin().from("audit_logs").insert({
    actor_username: actor,
    actor_role: "admin",
    action: importType === "statement" ? "rollback_statement_import" : "rollback_payout_import",
    target_type: "import_history",
    target_id: importIdValue,
    old_value: "",
    new_value: "rolled_back",
    note
  });
  if (error) throw new Error(`audit_logs: ${error.message}`);
}

function unsupportedSpreadsheet(fileName: string) {
  return /\.(xlsx|xls)$/i.test(fileName);
}

export async function importStatementFile(args: {
  csvText: string;
  fileName: string;
  uploadedBy: string;
  accountId: string;
  bank: string;
  driveFile: DriveFileMeta;
}): Promise<ImportSummary> {
  if (unsupportedSpreadsheet(args.fileName)) throw new Error("ตอนนี้รองรับ statement เป็น CSV ก่อน กรุณา export เป็น .csv แล้วอัปโหลดใหม่");
  const account = await loadBankAccount(args.accountId, args.bank);
  if (!account) throw new Error("กรุณาเลือกบัญชีธนาคารในระบบ");
  const fileBank = assertStatementFileMatchesAccount(args.csvText, account, args.bank);
  const parsed = fileBank === "SCB"
    ? parseScbStatementCsv(args.csvText, args.fileName, args.uploadedBy, { ...account, bank: fileBank })
    : fileBank === "KTB"
      ? parseKtbStatementCsv(args.csvText, args.fileName, args.uploadedBy, { ...account, bank: fileBank })
      : (() => { throw new Error("รองรับเฉพาะ SCB และ KTB ในเฟสนี้"); })();
  if ((parsed.accountMismatchCount || 0) > 0) {
    throw new Error(statementAccountMismatchMessage(parsed, account));
  }
  const rows = parsed.rows.map((row) => ({
    ...row,
    source_file_id: args.driveFile.drive_file_id,
    source_file_name: args.driveFile.file_name || args.fileName,
    source_file_url: args.driveFile.web_view_link
  }));
  const result = await insertNewRows("statements", rows);
  const months = Array.from(new Set(rows.map((row) => row.transaction_date?.slice(0, 7)).filter(Boolean) as string[]));
  for (const month of months) await syncStatementDaily({ month });
  const import_id = importId();
  await recordImportHistory({
    import_id,
    import_type: "statement",
    source_file_name: args.driveFile.file_name || args.fileName,
    source_file_id: args.driveFile.drive_file_id,
    source_file_url: args.driveFile.web_view_link,
    uploaded_by: args.uploadedBy,
    record_count: rows.length,
    processed_count: rows.length,
    inserted_count: result.inserted,
    skipped_count: result.skipped,
    warnings: parsed.warnings
  });
  await recordAudit("upload_statement", args.driveFile.drive_file_id, args.uploadedBy, args.fileName, `processed=${rows.length}, inserted=${result.inserted}, skipped=${result.skipped}`);
  return {
    success: true,
    import_id,
    import_type: "statement",
    file_name: args.driveFile.file_name || args.fileName,
    record_count: rows.length,
    processed_count: rows.length,
    inserted_count: result.inserted,
    skipped_count: result.skipped,
    warnings: parsed.warnings,
    errors: parsed.errors,
    preview: rows.slice(0, 10),
    synced_months: months
  };
}

export async function validateStatementFileBeforeUpload(args: {
  csvText: string;
  fileName: string;
  uploadedBy: string;
  accountId: string;
  bank: string;
}) {
  if (unsupportedSpreadsheet(args.fileName)) throw new Error("ตอนนี้รองรับ statement เป็น CSV ก่อน กรุณา export เป็น .csv แล้วอัปโหลดใหม่");
  const account = await loadBankAccount(args.accountId, args.bank);
  if (!account) throw new Error("กรุณาเลือกบัญชีธนาคารในระบบ");
  const fileBank = assertStatementFileMatchesAccount(args.csvText, account, args.bank);
  const parsed = fileBank === "SCB"
    ? parseScbStatementCsv(args.csvText, args.fileName, args.uploadedBy, { ...account, bank: fileBank })
    : fileBank === "KTB"
      ? parseKtbStatementCsv(args.csvText, args.fileName, args.uploadedBy, { ...account, bank: fileBank })
      : (() => { throw new Error("รองรับเฉพาะ SCB และ KTB ในเฟสนี้"); })();
  if ((parsed.accountMismatchCount || 0) > 0) {
    throw new Error(statementAccountMismatchMessage(parsed, account));
  }
  if (!parsed.rows.length) throw new Error("ไม่พบรายการ statement ในไฟล์");
  return {
    rows: parsed.rows.length,
    warnings: parsed.warnings,
    errors: parsed.errors
  };
}

export async function validatePayoutFileBeforeUpload(args: {
  csvText: string;
  fileName: string;
  sourceAccountId: string;
}) {
  if (unsupportedSpreadsheet(args.fileName)) throw new Error("ตอนนี้รองรับ payout item เป็น CSV ก่อน กรุณา export เป็น .csv แล้วอัปโหลดใหม่");
  if (!args.sourceAccountId) throw new Error("กรุณาเลือกบัญชีต้นทาง payout");
  const accounts = await loadBankAccounts();
  const selected = accounts.find((account) => account.id === args.sourceAccountId);
  if (!selected) throw new Error("ไม่พบบัญชีต้นทาง payout ที่เลือก");
  const parsed = parsePayoutCsv(args.csvText, args.fileName, "admin", importId(), accounts, selected);
  const mismatch = parsed.warnings.find((warning) => warning.includes("ไม่ตรงกับบัญชี payout ที่เลือก"));
  if (mismatch) throw new Error(mismatch);
  if (!parsed.rows.length) throw new Error("ไม่พบรายการ payout ในไฟล์");
  return {
    rows: parsed.rows.length,
    warnings: parsed.warnings,
    errors: parsed.errors
  };
}

export async function listImportHistory(importType: "statement" | "payout", limit = 8): Promise<ImportHistoryRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("import_history")
    .select("import_id, import_type, source_file_name, source_file_id, source_file_url, uploaded_by, uploaded_at, record_count, processed_count, inserted_count, skipped_count")
    .eq("import_type", importType)
    .order("uploaded_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));
  if (error) throw new Error(`import_history: ${error.message}`);
  return (data || []) as ImportHistoryRow[];
}

function monthStart(month: string) {
  return `${month}-01`;
}

function nextMonth(month: string) {
  const [year, rawMonth] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, rawMonth || 1, 1));
  return date.toISOString().slice(0, 10);
}

async function resyncStatementMonths(months: string[], accountNos: string[]) {
  const uniqueMonths = Array.from(new Set(months.filter(Boolean)));
  const uniqueAccounts = Array.from(new Set(accountNos.filter(Boolean)));
  for (const month of uniqueMonths) {
    let deleteQuery = getSupabaseAdmin()
      .from("bank_statement_daily")
      .delete()
      .gte("date", monthStart(month))
      .lt("date", nextMonth(month));
    if (uniqueAccounts.length) deleteQuery = deleteQuery.in("account_no", uniqueAccounts);
    const { error } = await deleteQuery;
    if (error) throw new Error(`bank_statement_daily rollback cleanup: ${error.message}`);
    await syncStatementDaily({ month });
  }
}

export async function rollbackImport(args: { importId: string; actor?: string }) {
  const importIdValue = text(args.importId);
  if (!importIdValue) throw new Error("Missing import_id");
  const actor = text(args.actor) || "admin";
  const { data: history, error: historyError } = await getSupabaseAdmin()
    .from("import_history")
    .select("*")
    .eq("import_id", importIdValue)
    .maybeSingle();
  if (historyError) throw new Error(`import_history: ${historyError.message}`);
  if (!history) throw new Error("ไม่พบ import ที่ต้องการ rollback");

  const importType = text(history.import_type);
  if (importType === "statement") {
    const sourceFileId = text(history.source_file_id);
    const sourceFileName = text(history.source_file_name);
    let selectQuery = getSupabaseAdmin()
      .from("statements")
      .select("statement_id, transaction_date, account_no");
    selectQuery = sourceFileId ? selectQuery.eq("source_file_id", sourceFileId) : selectQuery.eq("source_file_name", sourceFileName);
    const { data: rows, error: selectError } = await selectQuery;
    if (selectError) throw new Error(`statements: ${selectError.message}`);

    let deleteQuery = getSupabaseAdmin().from("statements").delete();
    deleteQuery = sourceFileId ? deleteQuery.eq("source_file_id", sourceFileId) : deleteQuery.eq("source_file_name", sourceFileName);
    const { error: deleteError } = await deleteQuery;
    if (deleteError) throw new Error(`statements rollback: ${deleteError.message}`);

    const statementRows = (rows || []) as JsonRecord[];
    const months = statementRows.map((row) => text(row.transaction_date).slice(0, 7));
    const accountNos = statementRows.map((row) => text(row.account_no));
    await resyncStatementMonths(months, accountNos);

    const { error: historyDeleteError } = await getSupabaseAdmin().from("import_history").delete().eq("import_id", importIdValue);
    if (historyDeleteError) throw new Error(`import_history rollback: ${historyDeleteError.message}`);
    await recordRollbackAudit("statement", importIdValue, actor, `deleted=${statementRows.length}, source_file=${sourceFileId || sourceFileName}`);
    return { success: true, import_id: importIdValue, import_type: "statement", deleted: statementRows.length, synced_months: Array.from(new Set(months.filter(Boolean))) };
  }

  if (importType === "payout") {
    const { data: payoutRows, error: selectError } = await getSupabaseAdmin()
      .from("payout_items")
      .select("payout_item_id")
      .eq("import_id", importIdValue);
    if (selectError) throw new Error(`payout_items: ${selectError.message}`);
    const payoutIds = ((payoutRows || []) as JsonRecord[]).map((row) => text(row.payout_item_id)).filter(Boolean);
    if (payoutIds.length) {
      for (const idsChunk of chunk(payoutIds, ROLLBACK_DELETE_CHUNK_SIZE)) {
        const { error: followupError } = await getSupabaseAdmin().from("payout_followups").delete().in("payout_item_id", idsChunk);
        if (followupError) throw new Error(`payout_followups rollback: ${followupError.message}`);
      }
    }
    const { error: deleteError } = await getSupabaseAdmin().from("payout_items").delete().eq("import_id", importIdValue);
    if (deleteError) throw new Error(`payout_items rollback: ${deleteError.message}`);
    const { error: historyDeleteError } = await getSupabaseAdmin().from("import_history").delete().eq("import_id", importIdValue);
    if (historyDeleteError) throw new Error(`import_history rollback: ${historyDeleteError.message}`);
    await recordRollbackAudit("payout", importIdValue, actor, `deleted=${payoutIds.length}`);
    return { success: true, import_id: importIdValue, import_type: "payout", deleted: payoutIds.length };
  }

  throw new Error(`Unsupported import_type: ${importType}`);
}

export async function importPayoutFile(args: {
  csvText: string;
  fileName: string;
  uploadedBy: string;
  driveFile: DriveFileMeta;
  sourceAccountId?: string;
}): Promise<ImportSummary> {
  if (unsupportedSpreadsheet(args.fileName)) throw new Error("ตอนนี้รองรับ payout item เป็น CSV ก่อน กรุณา export เป็น .csv แล้วอัปโหลดใหม่");
  const accounts = await loadBankAccounts();
  const selectedSourceAccount = args.sourceAccountId ? accounts.find((account) => account.id === args.sourceAccountId) || null : null;
  const import_id = importId();
  const parsed = parsePayoutCsv(args.csvText, args.fileName, args.uploadedBy, import_id, accounts, selectedSourceAccount);
  const rows = parsed.rows.map((row) => ({
    ...row,
    source_file_id: args.driveFile.drive_file_id,
    source_file_name: args.driveFile.file_name || args.fileName,
    source_file_url: args.driveFile.web_view_link
  }));
  const result = await insertNewRows("payout_items", rows);
  await recordImportHistory({
    import_id,
    import_type: "payout",
    source_file_name: args.driveFile.file_name || args.fileName,
    source_file_id: args.driveFile.drive_file_id,
    source_file_url: args.driveFile.web_view_link,
    uploaded_by: args.uploadedBy,
    record_count: rows.length,
    processed_count: rows.length,
    inserted_count: result.inserted,
    skipped_count: result.skipped,
    warnings: parsed.warnings
  });
  await recordAudit("upload_payout", import_id, args.uploadedBy, args.fileName, `processed=${rows.length}, inserted=${result.inserted}, skipped=${result.skipped}`);
  return {
    success: true,
    import_id,
    import_type: "payout",
    file_name: args.driveFile.file_name || args.fileName,
    record_count: rows.length,
    processed_count: rows.length,
    inserted_count: result.inserted,
    skipped_count: result.skipped,
    warnings: parsed.warnings,
    errors: parsed.errors,
    preview: rows.slice(0, 10)
  };
}
