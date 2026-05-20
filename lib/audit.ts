import {
  getFailedPayoutItemsByDate,
  getWithdrawCarryoversByMonth,
  listBalancesThroughMonth,
  listMasterData,
  listRowsByDate,
  listRowsByMonth,
  listStatementDaily
} from "@/lib/repositories";
import { normalizeMonth, round2 } from "@/lib/dates";
import type { AuditRow, JsonRecord, StatementDailyRow } from "@/lib/types";

export type AuditAccountBreakdown = {
  bank: string;
  accountNo: string;
  openingBalance: number;
  deposit: number;
  withdraw: number;
  fee: number;
  expectedBalance: number;
  endingBalance: number;
  actualBalance: number;
  balanceAccountNames: string[];
  hasActualBalance: boolean;
  diff: number;
};

/**
 * โหลด breakdown รายบัญชีสำหรับวันที่เลือก
 * - ดึง row ของวันนั้นจาก bank_statement_daily และของวันก่อนหน้า (เพื่อใช้เป็น opening)
 * - opening balance = ending balance ของวันก่อนหน้าของบัญชีเดียวกัน (0 ถ้าไม่มีประวัติ)
 */
export async function getAuditAccountBreakdown(date: string): Promise<AuditAccountBreakdown[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const [statementRows, balanceRows, masterData] = await Promise.all([
    listStatementDaily(date.slice(0, 7)),
    listRowsByDate<JsonRecord>("balances", "date", date),
    listMasterData()
  ]);
  const dayRows = statementRows.filter((row) => row.date === date);
  const priorRows = statementRows.filter((row) => row.date < date);

  // latest ending_balance per account before `date`
  const openingMap = new Map<string, number>();
  for (const row of priorRows as StatementDailyRow[]) {
    const key = `${row.bank}|${row.account_no}`;
    openingMap.set(key, Number(row.ending_balance || 0));
  }

  const accountNoByBalanceName = buildAccountNoByBalanceName(masterData.bankAccounts);

  const actualByAccountNo = new Map<string, { amount: number; names: Set<string> }>();
  const latestBalances = new Map<string, { accountNo: string; name: string; amount: number; order: string }>();
  for (const row of balanceRows) {
    const type = String(row.balance_type || "").trim();
    if (type !== "บัญชีฝาก" && type !== "บัญชีถอน") continue;
    const name = String(row.account_name || "").trim();
    if (!name) continue;
    const mappedAccountNo = accountNoByBalanceName.get(normalizeKey(name));
    const accountNo = mappedAccountNo || normalizeAccountNo(name);
    if (!accountNo) continue;
    const key = `${accountNo}|${type}|${normalizeKey(name)}`;
    const order = `${row.date || ""} ${row.time || ""} ${row.created_at || ""}`;
    const previous = latestBalances.get(key);
    if (!previous || previous.order < order) {
      latestBalances.set(key, { accountNo, name, amount: Number(row.amount || 0), order });
    }
  }
  for (const item of latestBalances.values()) {
    const current = actualByAccountNo.get(item.accountNo) || { amount: 0, names: new Set<string>() };
    current.amount = round2(current.amount + item.amount);
    current.names.add(item.name);
    actualByAccountNo.set(item.accountNo, current);
  }

  const results: AuditAccountBreakdown[] = [];
  for (const row of dayRows as StatementDailyRow[]) {
    const key = `${row.bank}|${row.account_no}`;
    const opening = openingMap.get(key) || 0;
    const deposit = Number(row.deposit_total || 0);
    const withdraw = Number(row.withdraw_total || 0);
    const fee = Number(row.fee_total || 0);
    const ending = Number(row.ending_balance || 0);
    const expected = opening + deposit - withdraw;
    const accountNo = String(row.account_no || "");
    const actual = actualByAccountNo.get(normalizeAccountNo(accountNo));
    const actualBalance = actual ? actual.amount : 0;
    results.push({
      bank: String(row.bank || ""),
      accountNo,
      openingBalance: round2(opening),
      deposit: round2(deposit),
      withdraw: round2(withdraw),
      fee: round2(fee),
      expectedBalance: round2(expected),
      endingBalance: round2(ending),
      actualBalance: round2(actualBalance),
      balanceAccountNames: actual ? Array.from(actual.names).sort() : [],
      hasActualBalance: Boolean(actual),
      diff: round2(actualBalance - expected)
    });
  }
  return results;
}

function normalizeKey(value: unknown): string {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function normalizeAccountNo(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function add(map: Record<string, number>, date: string, value: number) {
  map[date] = round2((map[date] || 0) + value);
}

function buildAccountNoByBalanceName(bankAccounts: JsonRecord[]): Map<string, string> {
  const accountNoByBalanceName = new Map<string, string>();
  for (const account of bankAccounts) {
    const accountName = normalizeKey(account.name);
    const accountNo = normalizeAccountNo(account.account_no);
    if (accountName && accountNo) accountNoByBalanceName.set(accountName, accountNo);
  }
  return accountNoByBalanceName;
}

function latestActualBalances(rows: JsonRecord[], accountNoByBalanceName?: Map<string, string>): Record<string, number> {
  const latestByKey = new Map<string, { date: string; amount: number; order: string }>();
  for (const row of rows) {
    const date = String(row.date || "").slice(0, 10);
    const account = String(row.account_name || "").trim();
    const type = String(row.balance_type || "").trim();
    if (!date || !account || (type !== "บัญชีฝาก" && type !== "บัญชีถอน")) continue;
    const mappedAccountNo = accountNoByBalanceName?.get(normalizeKey(account));
    const accountNo = mappedAccountNo || normalizeAccountNo(account);
    if (accountNoByBalanceName && !accountNo) continue;
    latestByKey.set(`${date}|${accountNo || account}|${type}`, {
      date,
      amount: Number(row.amount || 0),
      order: `${date} ${row.time || ""} ${row.created_at || ""}`
    });
  }
  const byDate: Record<string, number> = {};
  for (const item of latestByKey.values()) add(byDate, item.date, item.amount);
  return byDate;
}

function previousStatementBalance(date: string, bankByDate: Record<string, { balance: number }>): number {
  const candidates = Object.keys(bankByDate).filter((key) => key < date).sort();
  if (candidates.length) return bankByDate[candidates[candidates.length - 1]]?.balance || 0;
  return 0;
}

export async function getAuditData(monthInput?: string | null) {
  const month = normalizeMonth(monthInput);
  const [
    statements,
    boRows,
    expenseRows,
    balanceRows,
    transferRows,
    cryptoRows,
    failedPayout,
    withdrawCarryovers,
    masterData
  ] = await Promise.all([
    listStatementDaily(month),
    listRowsByMonth<JsonRecord>("bogo2pay_transactions", "date", month),
    listRowsByMonth<JsonRecord>("expenses", "date", month),
    listBalancesThroughMonth(month),
    listRowsByMonth<JsonRecord>("transfers", "date", month),
    listRowsByMonth<JsonRecord>("crypto_transactions", "date", month),
    getFailedPayoutItemsByDate(month),
    getWithdrawCarryoversByMonth(month),
    listMasterData()
  ]);

  const dateKeys = new Set<string>();
  const bankByDate: Record<string, { deposit: number; withdraw: number; fee: number; balance: number }> = {};
  const boDeposit: Record<string, number> = {};
  const boWithdraw: Record<string, number> = {};
  const expenses: Record<string, number> = {};
  const transferOnly: Record<string, number> = {};
  const settlement: Record<string, number> = {};
  const errorFollowTransfer: Record<string, number> = {};
  const otherTransfer: Record<string, number> = {};
  const capitalIn: Record<string, number> = {};
  const capitalReturn: Record<string, number> = {};
  const moveTotal: Record<string, number> = {};
  const buyUSDTthb: Record<string, number> = {};
  const buyUSDT: Record<string, number> = {};

  for (const row of statements) {
    const date = row.date;
    dateKeys.add(date);
    bankByDate[date] ||= { deposit: 0, withdraw: 0, fee: 0, balance: 0 };
    bankByDate[date].deposit = round2(bankByDate[date].deposit + Number(row.deposit_total || 0));
    bankByDate[date].withdraw = round2(bankByDate[date].withdraw + Number(row.withdraw_total || 0));
    bankByDate[date].fee = round2(bankByDate[date].fee + Number(row.fee_total || 0));
    bankByDate[date].balance = round2(bankByDate[date].balance + Number(row.ending_balance || 0));
  }

  for (const row of boRows) {
    const date = String(row.date || "").slice(0, 10);
    if (!date) continue;
    dateKeys.add(date);
    const value = Number(row.actual_amount || 0);
    if (row.type === "ฝาก") add(boDeposit, date, value);
    if (row.type === "ถอน") add(boWithdraw, date, value);
  }

  for (const row of expenseRows) {
    const date = String(row.date || "").slice(0, 10);
    if (!date) continue;
    dateKeys.add(date);
    add(expenses, date, Number(row.amount || 0));
  }

  const actualByDate = latestActualBalances(balanceRows, buildAccountNoByBalanceName(masterData.bankAccounts));
  Object.keys(actualByDate).filter((date) => date.startsWith(month)).forEach((date) => dateKeys.add(date));

  for (const row of transferRows) {
    const date = String(row.date || "").slice(0, 10);
    const status = String(row.status || "");
    if (!date || status === "ฝากเงินสด" || status === "ถอนเงินสด") continue;
    const amount = Number(row.amount || 0);
    add(moveTotal, date, amount);
    if (status === "โยกเงิน") add(transferOnly, date, amount);
    else if (status === "โอน Settlement") add(settlement, date, amount);
    else if (status === "โอนตามยอดerror") add(errorFollowTransfer, date, amount);
    else if (status === "เติมทุน") add(capitalIn, date, amount);
    else if (status === "คืนทุน") add(capitalReturn, date, amount);
    else if (status === "อื่นๆ") add(otherTransfer, date, amount);
  }

  for (const row of cryptoRows) {
    const date = String(row.date || "").slice(0, 10);
    if (!date || row.status !== "ซื้อ USDT") continue;
    add(moveTotal, date, Number(row.amount_thb || 0));
    add(buyUSDTthb, date, Number(row.amount_thb || 0));
    add(buyUSDT, date, Number(row.usdt || 0));
  }

  Object.keys(failedPayout.byDate).forEach((date) => dateKeys.add(date));
  Object.keys(withdrawCarryovers.byBoDate).forEach((date) => dateKeys.add(date));
  Object.keys(withdrawCarryovers.byPaidDate).forEach((date) => dateKeys.add(date));

  const rows: AuditRow[] = Array.from(dateKeys).sort().map((date) => {
    const bank = bankByDate[date] || { deposit: 0, withdraw: 0, fee: 0, balance: 0 };
    const actualBalance = Object.prototype.hasOwnProperty.call(actualByDate, date) ? actualByDate[date] : 0;
    const openingBalance = previousStatementBalance(date, bankByDate);
    const expectedBalance = openingBalance + bank.deposit - bank.withdraw;
    const diffBank = actualBalance - expectedBalance;
    const diffDeposit = bank.deposit - (boDeposit[date] || 0);
    const diffWithdraw = bank.withdraw - (boWithdraw[date] || 0);
    const withdrawCarryoverOut = withdrawCarryovers.byBoDate[date] || 0;
    const withdrawCarryoverIn = withdrawCarryovers.byPaidDate[date] || 0;
    const withdrawReference = (transferOnly[date] || 0)
      + (settlement[date] || 0)
      + (errorFollowTransfer[date] || 0)
      + (otherTransfer[date] || 0)
      + (buyUSDTthb[date] || 0);
    const explainedDiffWithdraw = diffWithdraw
      + withdrawCarryoverOut
      - withdrawCarryoverIn
      - (failedPayout.byDatePaidSameDay[date] || 0)
      - (expenses[date] || 0)
      - bank.fee
      - withdrawReference;
    const flags: string[] = [];
    if (Math.abs(diffBank) > 1) flags.push("ปิดยอดไม่ตรง");
    if (Math.abs(explainedDiffWithdraw) > 1) flags.push("ตรวจถอนเกิน BO");
    if ((failedPayout.byDate[date] || 0) > 0) flags.push("มีรายการต้องโอนตาม");
    if (diffDeposit < 0) flags.push("ตรวจฝาก BO เกินธนาคาร");
    return {
      date,
      openingBalance: round2(openingBalance),
      bankDeposit: round2(bank.deposit),
      bankWithdraw: round2(bank.withdraw),
      statementFee: round2(bank.fee),
      sheetExpense: round2(expenses[date] || 0),
      expectedBalance: round2(expectedBalance),
      actualBalance: round2(actualBalance),
      diffBank: round2(diffBank),
      boDeposit: round2(boDeposit[date] || 0),
      diffDeposit: round2(diffDeposit),
      boWithdraw: round2(boWithdraw[date] || 0),
      failedWithdraw: round2(failedPayout.byDate[date] || 0),
      failedWithdrawCount: failedPayout.byDateCount[date] || 0,
      failedWithdrawPaid: round2(failedPayout.byDatePaid[date] || 0),
      failedWithdrawPaidCount: failedPayout.byDatePaidCount[date] || 0,
      failedWithdrawPaidSameDay: round2(failedPayout.byDatePaidSameDay[date] || 0),
      failedWithdrawPaidSameDayCount: failedPayout.byDatePaidSameDayCount[date] || 0,
      failedWithdrawPending: round2(failedPayout.byDatePending[date] || 0),
      failedWithdrawPendingCount: failedPayout.byDatePendingCount[date] || 0,
      failedWithdrawDetails: failedPayout.detailsByDate[date] || [],
      withdrawCarryoverOut: round2(withdrawCarryoverOut),
      withdrawCarryoverOutCount: withdrawCarryovers.byBoDateCount[date] || 0,
      withdrawCarryoverIn: round2(withdrawCarryoverIn),
      withdrawCarryoverInCount: withdrawCarryovers.byPaidDateCount[date] || 0,
      withdrawCarryoverDetails: withdrawCarryovers.detailsByDate[date] || [],
      diffWithdraw: round2(diffWithdraw),
      transferOnly: round2(transferOnly[date] || 0),
      settlement: round2(settlement[date] || 0),
      errorFollowTransfer: round2(errorFollowTransfer[date] || 0),
      otherTransfer: round2(otherTransfer[date] || 0),
      capitalIn: round2(capitalIn[date] || 0),
      capitalReturn: round2(capitalReturn[date] || 0),
      buyUSDTthb: round2(buyUSDTthb[date] || 0),
      buyUSDT: round2(buyUSDT[date] || 0),
      moveTotal: round2(moveTotal[date] || 0),
      status: flags.length ? flags.join(" / ") : "ปิดตรง"
    };
  });

  const totals = rows.reduce<Record<string, number>>((total, row) => {
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "number") total[key] = round2((total[key] || 0) + value);
    }
    return total;
  }, {});

  return {
    success: true,
    month,
    rows,
    totals,
    payoutItems: {
      success: true,
      sourceRows: failedPayout.sourceRows,
      failedCount: failedPayout.failedCount,
      queryDateColumn: "value_date"
    }
  };
}
