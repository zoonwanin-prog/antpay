#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const sheetAliases = new Map([
  ["ผู้ใช้งาน", "app_users"],
  ["app_users", "app_users"],
  ["บัญชีคริปโต", "crypto_accounts"],
  ["crypto_accounts", "crypto_accounts"],
  ["บัญชีธนาคาร", "bank_accounts"],
  ["bank_accounts", "bank_accounts"],
  ["BotLog", "bot_logs"],
  ["bot_logs", "bot_logs"],
  ["Botticket", "bot_tickets"],
  ["bot_tickets", "bot_tickets"],
  ["โยกเงิน", "transfers"],
  ["transfers", "transfers"],
  ["คริปโต", "crypto_transactions"],
  ["crypto", "crypto_transactions"],
  ["crypto_transactions", "crypto_transactions"],
  ["ยอดคงเหลือ", "balances"],
  ["balances", "balances"],
  ["รายจ่าย", "expenses"],
  ["expenses", "expenses"],
  ["BoGo2pay", "bogo2pay_transactions"],
  ["bogo2pay", "bogo2pay_transactions"],
  ["bogo2pay_transactions", "bogo2pay_transactions"],
  ["bank_statement_daily", "bank_statement_daily"],
  ["payout_items", "payout_items"],
  ["safewallet", "safewallet_transactions"],
  ["safewallet_transactions", "safewallet_transactions"]
]);

const args = parseArgs(process.argv.slice(2));
const commit = Boolean(args.commit);
const file = args.file;
const dir = args.dir;

if (!file && !dir) usage("Missing --file or --dir");
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) usage("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with: node --env-file=.env.local scripts/import-csv.mjs ...");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const files = file ? [file] : (await fs.readdir(dir)).filter((name) => /\.(csv|xlsx)$/i.test(name)).map((name) => path.join(dir, name));
for (const inputPath of files) {
  const inputs = /\.xlsx$/i.test(inputPath)
    ? readXlsx(inputPath)
    : [{ name: args.sheet || inferSheetName(inputPath), records: csvToObjects(await fs.readFile(inputPath, "utf8")) }];
  for (const input of inputs) {
    const sheetName = args.sheet || input.name;
    const table = sheetAliases.get(sheetName);
    if (!table) {
      console.log(`SKIP ${inputPath}: unknown sheet "${sheetName}". Pass --sheet <name>.`);
      continue;
    }
    const records = input.records;
    const rows = records.map((record, index) => mapRecord(table, sheetName, record, index + 2)).filter(Boolean);
    console.log(`${commit ? "IMPORT" : "DRY-RUN"} ${path.basename(inputPath)} / ${sheetName} -> ${table}: ${rows.length}/${records.length} rows`);
    if (rows[0]) console.log("sample:", JSON.stringify(rows[0], null, 2));
    if (!commit || !rows.length) continue;
    await upsertRows(table, rows);
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--commit") out.commit = true;
    else if (arg.startsWith("--")) out[arg.slice(2)] = argv[++i];
  }
  return out;
}

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  node --env-file=.env.local scripts/import-csv.mjs --file ./data/โยกเงิน.csv --sheet โยกเงิน
  node --env-file=.env.local scripts/import-csv.mjs --file ./Go2PayBO.xlsx
  node --env-file=.env.local scripts/import-csv.mjs --file ./data/โยกเงิน.csv --sheet โยกเงิน --commit
  node --env-file=.env.local scripts/import-csv.mjs --dir ./data --commit

Supported sheets:
  ผู้ใช้งาน, บัญชีธนาคาร, บัญชีคริปโต, BotLog, Botticket,
  โยกเงิน, คริปโต, ยอดคงเหลือ, รายจ่าย, BoGo2pay, bank_statement_daily, payout_items, safewallet
`);
  process.exit(message ? 1 : 0);
}

function readXlsx(xlsxPath) {
  const python = process.env.PYTHON || "/Users/taytin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
  const code = String.raw`
import datetime, json, sys
from openpyxl import load_workbook

def cell(v):
    if v is None:
        return ""
    if isinstance(v, datetime.datetime):
        return v.isoformat(sep=" ")
    if isinstance(v, datetime.date):
        return v.isoformat()
    if isinstance(v, datetime.time):
        return v.isoformat()
    return str(v)

wb = load_workbook(sys.argv[1], read_only=True, data_only=True)
out = []
for ws in wb.worksheets:
    iterator = ws.iter_rows(values_only=True)
    try:
        headers = [cell(v).strip() for v in next(iterator)]
    except StopIteration:
        continue
    records = []
    for row in iterator:
        vals = [cell(v) for v in row]
        if not any(str(v).strip() for v in vals):
            continue
        records.append({headers[i]: vals[i] if i < len(vals) else "" for i in range(len(headers)) if headers[i]})
    out.append({"name": ws.title, "records": records})
print(json.dumps(out, ensure_ascii=False))
`;
  const result = spawnSync(python, ["-c", code, xlsxPath], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Failed to read xlsx: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

function inferSheetName(csvPath) {
  const base = path.basename(csvPath, path.extname(csvPath));
  for (const key of sheetAliases.keys()) {
    if (base.toLowerCase().includes(key.toLowerCase())) return key;
  }
  return base;
}

function csvToObjects(text) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  const headers = (rows.shift() || []).map((h) => h.trim());
  return rows
    .filter((row) => row.some((cell) => String(cell || "").trim() !== ""))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
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
  return rows;
}

function get(record, names) {
  const wanted = names.map(normalizeHeader);
  for (const [key, value] of Object.entries(record)) {
    if (wanted.includes(normalizeHeader(key))) return clean(value);
  }
  return "";
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "").replace(/[()（）]/g, "");
}

function clean(value) {
  return String(value ?? "").trim();
}

function num(value) {
  const text = clean(value).replace(/[,\s฿]/g, "").replace(/[()]/g, "");
  const n = Number.parseFloat(text);
  return Number.isFinite(n) ? n : 0;
}

function date(value) {
  const s = clean(value);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (m) {
    let y = Number(m[3]);
    if (y > 2400) y -= 543;
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function time(value) {
  const s = clean(value);
  if (!s) return null;
  const m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}:${m[3] || "00"}` : null;
}

function timestamp(value) {
  const s = clean(value);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.replace(" ", "T");
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function keyFor(sheet, record, rowNumber) {
  return crypto.createHash("sha256").update(`${sheet}|${rowNumber}|${JSON.stringify(record)}`).digest("hex");
}

function mapRecord(table, sheet, record, rowNumber) {
  const import_key = keyFor(sheet, record, rowNumber);
  if (table === "app_users") {
    const username = get(record, ["ชื่อผู้ใช้งาน", "username"]);
    if (!username) return null;
    return {
      username,
      password_hash: get(record, ["รหัสผ่าน", "password", "password_hash"]) || null,
      role: get(record, ["สิทธิ์", "role"]) || "admin"
    };
  }
  if (table === "crypto_accounts") {
    const name = get(record, ["ชื่อบัญชี", "name"]);
    if (!name) return null;
    return {
      name,
      address: get(record, ["เลข address", "address"]),
      network: get(record, ["network"])
    };
  }
  if (table === "bank_accounts") {
    const name = get(record, ["ชื่อบัญชี", "name"]);
    if (!name) return null;
    return {
      name,
      account_no: get(record, ["เลขบัญชี / PromptPay", "เลขบัญชี", "account_no"]),
      account_type: get(record, ["ประเภท", "account_type"])
    };
  }
  if (table === "bot_logs") {
    const rowDate = date(get(record, ["วันที่", "date"]));
    const job = get(record, ["งาน", "job"]);
    if (!rowDate || !job) return null;
    return {
      date: rowDate,
      time: time(get(record, ["เวลา", "time"])),
      job,
      status: get(record, ["สถานะ", "status"]),
      detail: get(record, ["รายละเอียด", "detail"])
    };
  }
  if (table === "bot_tickets") {
    const ticketId = get(record, ["Ticket ID", "ticket_id"]);
    if (!ticketId) return null;
    return {
      ticket_id: ticketId,
      ticket_number: get(record, ["Ticket Number", "ticket_number"]),
      merchant: get(record, ["Merchant", "merchant"]),
      merchant_email: get(record, ["Merchant Email", "merchant_email"]),
      subject: get(record, ["Subject", "subject"]),
      category: get(record, ["Category", "category"]),
      priority: get(record, ["Priority", "priority"]),
      status: get(record, ["Status", "status"]),
      created_at_source: timestamp(get(record, ["Created At", "created_at_source", "created_at"])),
      last_reply_at: timestamp(get(record, ["Last Reply At", "last_reply_at"])),
      last_reply_by: get(record, ["Last Reply By", "last_reply_by"]),
      link: get(record, ["Link", "link"]),
      notified_at: timestamp(get(record, ["แจ้งเตือนแล้ว", "notified_at"]))
    };
  }
  if (table === "transfers") {
    const rowDate = date(get(record, ["วันที่", "date"]));
    if (!rowDate) return null;
    return {
      import_key,
      date: rowDate,
      time: time(get(record, ["เวลา", "time"])),
      source_account: get(record, ["บัญชีต้นทาง", "จากบัญชี", "source_account"]),
      status: get(record, ["สถานะ", "ประเภท", "status"]),
      target_account: get(record, ["บัญชีปลายทาง", "ไปบัญชี", "target_account"]),
      amount: num(get(record, ["จำนวน", "amount"])),
      fee: num(get(record, ["ค่าธรรมเนียม", "fee"])),
      user_name: get(record, ["ผู้ทำรายการ", "ผู้บันทึก", "user_name"]),
      note: get(record, ["หมายเหตุ", "note"]),
      slip_url: get(record, ["ลิงก์รูป", "slip_url"]) || null
    };
  }
  if (table === "crypto_transactions") {
    const rowDate = date(get(record, ["วันที่", "date"]));
    if (!rowDate) return null;
    return {
      import_key,
      date: rowDate,
      time: time(get(record, ["เวลา", "time"])),
      source_account: get(record, ["บัญชีต้นทาง", "จากบัญชี", "source_account"]),
      status: get(record, ["สถานะ", "ประเภท", "status"]),
      target_account: get(record, ["บัญชีปลายทาง", "ไปบัญชี", "target_account"]),
      amount_thb: num(get(record, ["จำนวน(บาท)", "จำนวนบาท", "amount_thb"])),
      exchange_rate: num(get(record, ["อัตราแลกเปลี่ยน", "exchange_rate"])),
      usdt: num(get(record, ["USDT", "usdt"])),
      note: get(record, ["หมายเหตุ", "note"]),
      user_name: get(record, ["ผู้ทำรายการ", "ผู้บันทึก", "user_name"]),
      slip_url: get(record, ["ลิงก์รูป", "slip_url"]) || null
    };
  }
  if (table === "balances") {
    const rowDate = date(get(record, ["วันที่", "date"]));
    if (!rowDate) return null;
    return {
      import_key,
      date: rowDate,
      time: time(get(record, ["เวลา", "time"])),
      account_name: get(record, ["จากบัญชี", "บัญชี", "account_name"]),
      balance_type: get(record, ["ประเภท", "balance_type"]),
      amount: num(get(record, ["จำนวนเงิน", "จำนวน", "amount"])),
      user_name: get(record, ["ผู้ทำรายการ", "ผู้บันทึก", "user_name"]),
      note: get(record, ["หมายเหตุ", "note"])
    };
  }
  if (table === "expenses") {
    const rowDate = date(get(record, ["วันที่", "date"]));
    if (!rowDate) return null;
    return {
      import_key,
      date: rowDate,
      time: time(get(record, ["เวลา", "time"])),
      item: get(record, ["รายการ", "item"]),
      amount: num(get(record, ["จำนวนเงิน", "จำนวน", "amount"])),
      note: get(record, ["หมายเหตุ", "note"]),
      user_name: get(record, ["ผู้บันทึก", "ผู้ทำรายการ", "user_name"])
    };
  }
  if (table === "bogo2pay_transactions") {
    const rowDate = date(get(record, ["วันที่", "date"]));
    if (!rowDate) return null;
    const actual = num(get(record, ["ยอดจริง", "จำนวนเงิน", "actual_amount", "จำนวน"]));
    const fee = num(get(record, ["ค่าธรรมเนียม", "fee"]));
    return {
      import_key,
      date: rowDate,
      time: time(get(record, ["เวลา", "time"])),
      item: get(record, ["รายการ", "item"]),
      type: get(record, ["ประเภท", "type"]),
      actual_amount: actual,
      fee,
      net_amount: num(get(record, ["ยอดสุทธิ", "net_amount"])) || actual - fee,
      note: get(record, ["หมายเหตุ", "note"]),
      user_name: get(record, ["ผู้บันทึก", "ผู้ทำรายการ", "user_name"])
    };
  }
  if (table === "bank_statement_daily") {
    const rowDate = date(get(record, ["วันที่", "date"]));
    if (!rowDate) return null;
    return {
      import_key,
      date: rowDate,
      bank: get(record, ["ธนาคาร", "bank"]),
      account_no: get(record, ["เลขบัญชี", "account_no"]),
      deposit_total: num(get(record, ["ฝากรวม", "deposit_total"])),
      withdraw_total: num(get(record, ["ถอนรวม", "withdraw_total"])),
      fee_total: num(get(record, ["Fee", "fee_total"])),
      ending_balance: num(get(record, ["ยอดเงินคงเหลือ", "ending_balance"])),
      failed_amount: num(get(record, ["ยอดไม่สำเร็จ", "failed_amount"])),
      failed_count: Math.trunc(num(get(record, ["จำนวนไม่สำเร็จ", "failed_count"])))
    };
  }
  if (table === "payout_items") {
    const rowDate = date(get(record, ["value_date", "วันที่", "date"]));
    if (!rowDate) return null;
    const id = get(record, ["id", "uuid", "payout_item_id", "Ticket ID"]) || import_key;
    return {
      id,
      value_date: rowDate,
      amount: num(get(record, ["amount", "จำนวน", "ยอดเงิน"])),
      status: get(record, ["status", "สถานะ"]) || "failed",
      recipient_name: get(record, ["recipient_name", "ชื่อผู้รับ"]),
      recipient_account_no: get(record, ["recipient_account_no", "เลขบัญชีผู้รับ"])
    };
  }
  if (table === "safewallet_transactions") {
    const rowDate = date(get(record, ["วันที่", "date", "created_at", "approved_at"]));
    if (!rowDate) return null;
    const sourceRef = get(record, ["id", "uuid", "source_ref"]) || import_key;
    return {
      import_key,
      source_ref: `csv:${sourceRef}`,
      date: rowDate,
      time: time(get(record, ["เวลา", "time", "created_at", "approved_at"])),
      merchant: get(record, ["merchant", "Merchant", "ร้านค้า", "ชื่อบัญชี"]),
      amount: num(get(record, ["amount", "amount_thb", "AMOUNT (THB)", "จำนวน", "USDT"])),
      status: get(record, ["status", "สถานะ"]) || "approved",
      note: get(record, ["หมายเหตุ", "note", "NET (THB)"]),
      created_at_source: get(record, ["created_at", "approved_at"]) || null
    };
  }
  return null;
}

async function upsertRows(table, rows) {
  const conflictByTable = {
    app_users: "username",
    bot_tickets: "ticket_id",
    payout_items: "id",
    crypto_accounts: null,
    bank_accounts: null,
    bot_logs: null
  };
  const conflict = Object.prototype.hasOwnProperty.call(conflictByTable, table) ? conflictByTable[table] : "import_key";
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const filteredBatch = conflict ? batch : await filterExistingNoConflictRows(table, batch);
    if (!filteredBatch.length) {
      console.log(`  skipped ${Math.min(i + batch.length, rows.length)}/${rows.length} (already exists)`);
      continue;
    }
    const query = conflict
      ? supabase.from(table).upsert(filteredBatch, { onConflict: conflict })
      : supabase.from(table).insert(filteredBatch);
    const { error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    console.log(`  upserted ${Math.min(i + batch.length, rows.length)}/${rows.length}`);
  }
}

async function filterExistingNoConflictRows(table, rows) {
  const keyByTable = {
    bank_accounts: "name",
    crypto_accounts: "name"
  };
  const key = keyByTable[table];
  if (!key) return rows;
  const values = rows.map((row) => row[key]).filter(Boolean);
  if (!values.length) return rows;
  const { data, error } = await supabase.from(table).select(key).in(key, values);
  if (error) throw new Error(`${table}: ${error.message}`);
  const existing = new Set((data || []).map((row) => row[key]));
  return rows.filter((row) => !existing.has(row[key]));
}
