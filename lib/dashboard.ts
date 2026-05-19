import { bangkokDate, round2 } from "@/lib/dates";
import {
  listRecentRows,
  listRowsByDate,
  listRowsThroughDate,
  listStatementDailyByDate
} from "@/lib/repositories";
import type { SummaryCryptoRow, SummaryDayRow } from "@/lib/summary";
import type { AuditRow, JsonRecord, StatementDailyRow } from "@/lib/types";

type LatestBalance = { date: string; account: string; type: string; amount: number; order: string };

function add(map: Record<string, number>, key: string, value: number) {
  map[key] = round2((map[key] || 0) + value);
}

function buildLatestBalanceMap(balanceRows: JsonRecord[]): LatestBalance[] {
  const map = new Map<string, LatestBalance>();
  for (const row of balanceRows) {
    const date = String(row.date || "").slice(0, 10);
    const account = String(row.account_name || "").trim();
    const type = String(row.balance_type || "").trim();
    if (!date || !account) continue;
    const key = `${date}|${account}|${type}`;
    const order = `${date} ${row.time || ""} ${row.created_at || ""}`;
    const prev = map.get(key);
    if (!prev || prev.order < order) {
      map.set(key, { date, account, type, amount: Number(row.amount || 0), order });
    }
  }
  return Array.from(map.values());
}

function pickWalletSnapshot(latest: LatestBalance[], date: string, account: string): number {
  const filtered = latest
    .filter((row) => row.account === account && row.date === date)
    .sort((a, b) => a.order.localeCompare(b.order));
  if (!filtered.length) return 0;
  return filtered[filtered.length - 1].amount;
}

function sumBankAccountBalance(latest: LatestBalance[], date: string): number {
  const bankRows = latest.filter(
    (row) => row.date === date && (row.type === "บัญชีฝาก" || row.type === "บัญชีถอน")
  );
  return round2(bankRows.reduce((total, row) => total + row.amount, 0));
}

function sumStatementRows(statementRows: StatementDailyRow[]) {
  return statementRows.reduce(
    (total, row) => ({
      deposit: round2(total.deposit + Number(row.deposit_total || 0)),
      withdraw: round2(total.withdraw + Number(row.withdraw_total || 0)),
      fee: round2(total.fee + Number(row.fee_total || 0)),
      balance: round2(total.balance + Number(row.ending_balance || 0))
    }),
    { deposit: 0, withdraw: 0, fee: 0, balance: 0 }
  );
}

function buildCryptoDay(targetDate: string, cryptoHistoryRows: JsonRecord[]): SummaryCryptoRow {
  const day = {
    buyUsdt: 0,
    buyThb: 0,
    withdrawUsdt: 0,
    withdrawThb: 0,
    transferUsdt: 0,
    transferThb: 0,
    sellUsdt: 0,
    sellThb: 0
  };
  let cumulativeUsdt = 0;
  let cumulativeThb = 0;

  for (const row of cryptoHistoryRows) {
    const date = String(row.date || "").slice(0, 10);
    const status = String(row.status || "");
    const usdt = Number(row.usdt || 0);
    const thb = Number(row.amount_thb || 0);

    if (date === targetDate) {
      if (status === "ซื้อ USDT") {
        day.buyUsdt = round2(day.buyUsdt + usdt);
        day.buyThb = round2(day.buyThb + thb);
      } else if (status === "ถอน USDT") {
        day.withdrawUsdt = round2(day.withdrawUsdt + usdt);
        day.withdrawThb = round2(day.withdrawThb + thb);
      } else if (status === "โอน USDT") {
        day.transferUsdt = round2(day.transferUsdt + usdt);
        day.transferThb = round2(day.transferThb + thb);
      } else if (status === "ขาย USDT") {
        day.sellUsdt = round2(day.sellUsdt + usdt);
        day.sellThb = round2(day.sellThb + thb);
      }
    }

    if (status === "ซื้อ USDT") {
      cumulativeUsdt = round2(cumulativeUsdt + usdt);
      cumulativeThb = round2(cumulativeThb + thb);
    } else if (status === "ขาย USDT" || status === "ถอน USDT" || status === "โอน USDT") {
      cumulativeUsdt = round2(cumulativeUsdt - usdt);
      cumulativeThb = round2(cumulativeThb - thb);
    }
  }

  return {
    date: targetDate,
    ...day,
    cumulativeUsdt: round2(cumulativeUsdt),
    cumulativeThb: round2(cumulativeThb)
  };
}

export async function getDashboardSummary(targetDate = bangkokDate()) {
  const [
    statementRows,
    boRows,
    transferRows,
    cryptoHistoryRows,
    safeWalletRows,
    expenseRows,
    balanceRows,
    botLogs
  ] = await Promise.all([
    listStatementDailyByDate(targetDate),
    listRowsByDate<JsonRecord>("bogo2pay_transactions", "date", targetDate),
    listRowsByDate<JsonRecord>("transfers", "date", targetDate),
    listRowsThroughDate<JsonRecord>("crypto_transactions", "date", targetDate),
    listRowsByDate<JsonRecord>("safewallet_transactions", "date", targetDate),
    listRowsByDate<JsonRecord>("expenses", "date", targetDate),
    listRowsByDate<JsonRecord>("balances", "date", targetDate),
    listRecentRows<JsonRecord>("bot_logs", "created_at", 20)
  ]);

  const bank = sumStatementRows(statementRows);
  const latestBalances = buildLatestBalanceMap(balanceRows);
  const accountBalance = sumBankAccountBalance(latestBalances, targetDate);
  const mainWalletBalance = round2(pickWalletSnapshot(latestBalances, targetDate, "Main"));
  const payoutWalletBalance = round2(pickWalletSnapshot(latestBalances, targetDate, "Payout"));
  const safeWalletBalance = round2(pickWalletSnapshot(latestBalances, targetDate, "SafeWallet"));
  const frozenBalance = round2(pickWalletSnapshot(latestBalances, targetDate, "Frozen"));

  let feeProfit = 0;
  let boDeposit = 0;
  let boWithdraw = 0;
  for (const row of boRows) {
    const actual = Number(row.actual_amount || 0);
    feeProfit = round2(feeProfit + Number(row.fee || 0));
    if (row.type === "ฝาก") boDeposit = round2(boDeposit + actual);
    if (row.type === "ถอน") boWithdraw = round2(boWithdraw + actual);
  }

  let moveTotal = 0;
  let capitalIn = 0;
  let capitalReturn = 0;
  const transferAudit: Record<string, number> = {
    transferOnly: 0,
    settlement: 0,
    errorFollowTransfer: 0,
    otherTransfer: 0
  };
  for (const row of transferRows) {
    const status = String(row.status || "");
    if (status === "ฝากเงินสด" || status === "ถอนเงินสด") continue;
    const amount = Number(row.amount || 0);
    moveTotal = round2(moveTotal + amount);
    if (status === "โยกเงิน") add(transferAudit, "transferOnly", amount);
    else if (status === "โอน Settlement") add(transferAudit, "settlement", amount);
    else if (status === "โอนตามยอดerror") add(transferAudit, "errorFollowTransfer", amount);
    else if (status === "เติมทุน") capitalIn = round2(capitalIn + amount);
    else if (status === "คืนทุน") capitalReturn = round2(capitalReturn + amount);
    else if (status === "อื่นๆ") add(transferAudit, "otherTransfer", amount);
  }

  let feeCost = 0;
  let safeWalletAmount = 0;
  let safeWalletNet = 0;
  for (const row of safeWalletRows) {
    feeCost = round2(feeCost + Number(row.fee_amount || 0));
    safeWalletAmount = round2(safeWalletAmount + Number(row.amount_thb || row.amount || 0));
    safeWalletNet = round2(safeWalletNet + Number(row.net_thb || 0));
  }

  const expense = round2(expenseRows.reduce((total, row) => total + Number(row.amount || 0), 0));
  const cryptoDay = buildCryptoDay(targetDate, cryptoHistoryRows);
  moveTotal = round2(moveTotal + cryptoDay.buyThb);

  const summaryDay: SummaryDayRow = {
    date: targetDate,
    feeProfit,
    feeCost,
    boDeposit,
    bankDeposit: bank.deposit,
    boWithdraw,
    bankWithdraw: bank.withdraw,
    moveTotal,
    mainPayoutBalance: round2(mainWalletBalance + payoutWalletBalance),
    mainWalletBalance,
    payoutWalletBalance,
    safeWalletBalance,
    frozenBalance,
    capitalIn,
    capitalReturn,
    accountBalance,
    accountDelta: 0,
    expense
  };

  const expectedBalance = round2(bank.deposit - bank.withdraw);
  const diffBank = round2(accountBalance - expectedBalance);
  const diffDeposit = round2(bank.deposit - boDeposit);
  const diffWithdraw = round2(bank.withdraw - boWithdraw);
  const flags: string[] = [];
  if (Math.abs(diffBank) > 1) flags.push("ปิดยอดไม่ตรง");
  if (diffWithdraw > 0) flags.push("ตรวจถอนเกิน BO");
  if (diffDeposit < 0) flags.push("ตรวจฝาก BO เกินธนาคาร");

  const auditDay: AuditRow = {
    date: targetDate,
    openingBalance: 0,
    bankDeposit: bank.deposit,
    bankWithdraw: bank.withdraw,
    statementFee: bank.fee,
    sheetExpense: expense,
    expectedBalance,
    actualBalance: accountBalance,
    diffBank,
    boDeposit,
    diffDeposit,
    boWithdraw,
    failedWithdraw: 0,
    failedWithdrawCount: 0,
    failedWithdrawPaid: 0,
    failedWithdrawPaidCount: 0,
    failedWithdrawPending: 0,
    failedWithdrawPendingCount: 0,
    failedWithdrawDetails: [],
    diffWithdraw,
    transferOnly: round2(transferAudit.transferOnly || 0),
    settlement: round2(transferAudit.settlement || 0),
    errorFollowTransfer: round2(transferAudit.errorFollowTransfer || 0),
    otherTransfer: round2(transferAudit.otherTransfer || 0),
    capitalIn,
    capitalReturn,
    buyUSDTthb: cryptoDay.buyThb,
    buyUSDT: cryptoDay.buyUsdt,
    moveTotal,
    status: flags.length ? flags.join(" / ") : "ปิดตรง"
  };

  const safeWalletLog = botLogs.find((row) => String(row.job || "").toLowerCase().includes("safewallet")) || null;

  return {
    success: true,
    date: targetDate,
    auditDay,
    summaryDay,
    cryptoDay,
    safeWallet: {
      count: safeWalletRows.length,
      amount: safeWalletAmount,
      fee: feeCost,
      net: safeWalletNet
    },
    sync: safeWalletLog ? {
      job: String(safeWalletLog.job || "SafeWallet sync"),
      date: String(safeWalletLog.date || ""),
      time: String(safeWalletLog.time || ""),
      status: String(safeWalletLog.status || ""),
      scanned: Number(safeWalletLog.scanned || 0),
      inserted: Number(safeWalletLog.inserted || 0)
    } : null,
    monthTotals: {},
    counts: {
      transfers: transferRows.length,
      cryptoTransactions: cryptoHistoryRows.filter((row) => String(row.date || "").slice(0, 10) === targetDate).length,
      expenses: expenseRows.length
    }
  };
}
