import {
  listBalancesThroughMonth,
  listRowsByMonth,
  listRowsThroughDate,
  listStatementDaily
} from "@/lib/repositories";
import { monthRange, normalizeMonth, round2 } from "@/lib/dates";
import type { JsonRecord, StatementDailyRow } from "@/lib/types";

export type SummaryDayRow = {
  date: string;
  // ค่าธรรมเนียม
  feeProfit: number;            // กำไรค่าธรรมเนียม (จาก BoGo2Pay)
  feeCost: number;              // ค่าธรรมเนียมจาก SafeWallet
  // ฝาก / ถอน
  boDeposit: number;
  bankDeposit: number;
  boWithdraw: number;
  bankWithdraw: number;
  // โอนเงิน
  moveTotal: number;            // โอนเงินรวม (โยก + Settlement + ซื้อ USDT THB)
  // ยอด wallet จาก go2pay
  mainPayoutBalance: number;
  mainWalletBalance: number;
  payoutWalletBalance: number;
  safeWalletBalance: number;    // USDT
  frozenBalance: number;
  // ต้นทุน / คืนทุน (จาก transfers)
  capitalIn: number;            // เติมทุน
  capitalReturn: number;        // คืนทุน
  // เงินในบัญชี
  accountBalance: number;       // sum of latest bank balances (บัญชีฝาก + บัญชีถอน) สำหรับวันนั้น
  accountDelta: number;         // เปลี่ยนแปลงจากวันก่อน (บวกเข้า-บวกถอน)
  // รายจ่าย
  expense: number;
};

export type SummaryCryptoRow = {
  date: string;
  buyUsdt: number;
  buyThb: number;
  withdrawUsdt: number;
  withdrawThb: number;
  transferUsdt: number;
  transferThb: number;
  sellUsdt: number;
  sellThb: number;
  cumulativeUsdt: number;
  cumulativeThb: number;
};

export type SummaryTotals = {
  feeProfit: number;
  feeCost: number;
  profit: number;               // feeProfit + SafeWallet fee
  moveTotal: number;
  boDeposit: number;
  bankDeposit: number;
  boWithdraw: number;
  bankWithdraw: number;
  capitalIn: number;
  capitalReturn: number;
  accountDelta: number;
  expense: number;
};

export type SummaryCryptoTotals = {
  buyUsdt: number;
  buyThb: number;
  withdrawUsdt: number;
  withdrawThb: number;
  transferUsdt: number;
  transferThb: number;
  sellUsdt: number;
  sellThb: number;
  endingUsdt: number;
  endingThb: number;
};

export type MonthlySummary = {
  success: true;
  month: string;
  rows: SummaryDayRow[];
  cryptoRows: SummaryCryptoRow[];
  totals: SummaryTotals;
  cryptoTotals: SummaryCryptoTotals;
};

function add(map: Record<string, number>, date: string, value: number) {
  if (!date) return;
  map[date] = round2((map[date] || 0) + value);
}

/**
 * เก็บ "balance ล่าสุดของวัน" ของแต่ละ (account_name, balance_type)
 * เพื่อเอาไปคำนวณยอด ณ สิ้นวัน
 */
type LatestBalance = { date: string; account: string; type: string; amount: number; order: string };

function buildLatestBalanceMap(balanceRows: JsonRecord[]): LatestBalance[] {
  const map = new Map<string, LatestBalance>();
  for (const row of balanceRows) {
    const date = String(row.date || "").slice(0, 10);
    const account = String(row.account_name || "").trim();
    const type = String(row.balance_type || "").trim();
    if (!date || !account) continue;
    const key = `${date}|${account}|${type}`;
    const prev = map.get(key);
    const order = `${date} ${row.time || ""} ${row.created_at || ""}`;
    if (!prev || prev.order < order) {
      map.set(key, { date, account, type, amount: Number(row.amount || 0), order });
    }
  }
  return Array.from(map.values());
}

/**
 * สำหรับ snapshot Wallet (Main, Payout, SafeWallet, Frozen) ที่ cron upsert ลง balances
 * ใช้ค่าล่าสุดของวัน — ถ้าวันนั้นไม่มี ใช้ค่าล่าสุดของวันที่ก่อนหน้า
 */
function pickWalletSnapshot(latest: LatestBalance[], date: string, account: string): number {
  const filtered = latest
    .filter((row) => row.account === account && row.date <= date)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!filtered.length) return 0;
  return filtered[filtered.length - 1].amount;
}

/**
 * เงินในบัญชีจริง ณ สิ้นวัน — รวม balance type "บัญชีฝาก" + "บัญชีถอน"
 */
function sumBankAccountBalance(latest: LatestBalance[], date: string): number {
  const bankRows = latest.filter(
    (row) => row.date === date && (row.type === "บัญชีฝาก" || row.type === "บัญชีถอน")
  );
  const sum = bankRows.reduce((acc, row) => acc + row.amount, 0);
  return round2(sum);
}

export async function getMonthlySummary(monthInput?: string | null): Promise<MonthlySummary> {
  const month = normalizeMonth(monthInput);
  const { start, end } = monthRange(month);
  const [
    statementRows,
    boRows,
    transferRows,
    cryptoRows,
    cryptoHistoryRows,
    safeWalletRows,
    expenseRows,
    balanceRows
  ] = await Promise.all([
    listStatementDaily(month),
    listRowsByMonth<JsonRecord>("bogo2pay_transactions", "date", month),
    listRowsByMonth<JsonRecord>("transfers", "date", month),
    listRowsByMonth<JsonRecord>("crypto_transactions", "date", month),
    listRowsThroughDate<JsonRecord>("crypto_transactions", "date", prevDay(start)),
    listRowsByMonth<JsonRecord>("safewallet_transactions", "date", month),
    listRowsByMonth<JsonRecord>("expenses", "date", month),
    listBalancesThroughMonth(month)
  ]);

  const dateKeys = new Set<string>();
  const feeProfit: Record<string, number> = {};
  const feeCost: Record<string, number> = {};
  const boDeposit: Record<string, number> = {};
  const bankDeposit: Record<string, number> = {};
  const boWithdraw: Record<string, number> = {};
  const bankWithdraw: Record<string, number> = {};
  const moveTotal: Record<string, number> = {};
  const capitalIn: Record<string, number> = {};
  const capitalReturn: Record<string, number> = {};
  const expenseByDate: Record<string, number> = {};

  // crypto aggregates per day
  const buyUsdtMap: Record<string, number> = {};
  const buyThbMap: Record<string, number> = {};
  const withdrawUsdtMap: Record<string, number> = {};
  const withdrawThbMap: Record<string, number> = {};
  const transferUsdtMap: Record<string, number> = {};
  const transferThbMap: Record<string, number> = {};
  const sellUsdtMap: Record<string, number> = {};
  const sellThbMap: Record<string, number> = {};

  for (const row of statementRows as StatementDailyRow[]) {
    const date = row.date;
    if (!date) continue;
    dateKeys.add(date);
    add(bankDeposit, date, Number(row.deposit_total || 0));
    add(bankWithdraw, date, Number(row.withdraw_total || 0));
  }

  for (const row of boRows) {
    const date = String(row.date || "").slice(0, 10);
    if (!date) continue;
    dateKeys.add(date);
    const actual = Number(row.actual_amount || 0);
    const fee = Number(row.fee || 0);
    if (row.type === "ฝาก") add(boDeposit, date, actual);
    if (row.type === "ถอน") add(boWithdraw, date, actual);
    add(feeProfit, date, fee);
  }

  for (const row of transferRows) {
    const date = String(row.date || "").slice(0, 10);
    if (!date) continue;
    dateKeys.add(date);
    const status = String(row.status || "");
    const amount = Number(row.amount || 0);
    if (status === "เติมทุน") add(capitalIn, date, amount);
    else if (status === "คืนทุน") add(capitalReturn, date, amount);
    if (status === "โยกเงิน" || status === "โอน Settlement") add(moveTotal, date, amount);
  }

  for (const row of cryptoRows) {
    const date = String(row.date || "").slice(0, 10);
    if (!date) continue;
    dateKeys.add(date);
    const status = String(row.status || "");
    const usdt = Number(row.usdt || 0);
    const thb = Number(row.amount_thb || 0);
    if (status === "ซื้อ USDT") {
      add(buyUsdtMap, date, usdt);
      add(buyThbMap, date, thb);
      add(moveTotal, date, thb);
    } else if (status === "ถอน USDT") {
      add(withdrawUsdtMap, date, usdt);
      add(withdrawThbMap, date, thb);
    } else if (status === "โอน USDT") {
      add(transferUsdtMap, date, usdt);
      add(transferThbMap, date, thb);
    } else if (status === "ขาย USDT") {
      add(sellUsdtMap, date, usdt);
      add(sellThbMap, date, thb);
    }
  }

  for (const row of safeWalletRows) {
    const date = String(row.date || "").slice(0, 10);
    if (!date) continue;
    dateKeys.add(date);
    add(feeCost, date, Number(row.fee_amount || 0));
  }

  for (const row of expenseRows) {
    const date = String(row.date || "").slice(0, 10);
    if (!date) continue;
    dateKeys.add(date);
    add(expenseByDate, date, Number(row.amount || 0));
  }

  const latestBalances = buildLatestBalanceMap(balanceRows);

  // make sure every day in month appears (so empty days still render)
  for (
    let cursor = start;
    cursor < end;
    cursor = nextDay(cursor)
  ) {
    dateKeys.add(cursor);
  }

  const sortedDates = Array.from(dateKeys).filter((d) => d >= start && d < end).sort();

  // previous-day cumulative crypto balance (from all history, anything <= start - 1)
  const openingCrypto = cryptoHistoryRows
    .reduce<{ usdt: number; thb: number }>((acc, row) => {
      const status = String(row.status || "");
      const usdt = Number(row.usdt || 0);
      const thb = Number(row.amount_thb || 0);
      if (status === "ซื้อ USDT") {
        return {
          usdt: acc.usdt + usdt,
          thb: acc.thb + thb
        };
      }
      if (status === "ขาย USDT" || status === "ถอน USDT" || status === "โอน USDT") {
        return {
          usdt: acc.usdt - usdt,
          thb: acc.thb - thb
        };
      }
      return acc;
    }, { usdt: 0, thb: 0 });
  let cumulativeUsdt = openingCrypto.usdt;
  let cumulativeThb = openingCrypto.thb;

  let previousAccountBalance = sumBankAccountBalance(latestBalances, prevDay(start));

  const rows: SummaryDayRow[] = [];
  const cryptoRowsOut: SummaryCryptoRow[] = [];

  for (const date of sortedDates) {
    const accountBalance = sumBankAccountBalance(latestBalances, date) || previousAccountBalance;
    const accountDelta = round2(accountBalance - previousAccountBalance);
    previousAccountBalance = accountBalance;

    rows.push({
      date,
      feeProfit: round2(feeProfit[date] || 0),
      feeCost: round2(feeCost[date] || 0),
      boDeposit: round2(boDeposit[date] || 0),
      bankDeposit: round2(bankDeposit[date] || 0),
      boWithdraw: round2(boWithdraw[date] || 0),
      bankWithdraw: round2(bankWithdraw[date] || 0),
      moveTotal: round2(moveTotal[date] || 0),
      mainWalletBalance: round2(pickWalletSnapshot(latestBalances, date, "Main")),
      payoutWalletBalance: round2(pickWalletSnapshot(latestBalances, date, "Payout")),
      mainPayoutBalance: round2(
        pickWalletSnapshot(latestBalances, date, "Main") + pickWalletSnapshot(latestBalances, date, "Payout")
      ),
      safeWalletBalance: round2(pickWalletSnapshot(latestBalances, date, "SafeWallet")),
      frozenBalance: round2(pickWalletSnapshot(latestBalances, date, "Frozen")),
      capitalIn: round2(capitalIn[date] || 0),
      capitalReturn: round2(capitalReturn[date] || 0),
      accountBalance: round2(accountBalance),
      accountDelta: round2(accountDelta),
      expense: round2(expenseByDate[date] || 0)
    });

    const buyU = buyUsdtMap[date] || 0;
    const sellU = sellUsdtMap[date] || 0;
    const withdrawU = withdrawUsdtMap[date] || 0;
    const transferU = transferUsdtMap[date] || 0;
    cumulativeUsdt = cumulativeUsdt + buyU - transferU - sellU - withdrawU;
    cumulativeThb = cumulativeThb
      + (buyThbMap[date] || 0)
      - (transferThbMap[date] || 0)
      - (sellThbMap[date] || 0)
      - (withdrawThbMap[date] || 0);

    cryptoRowsOut.push({
      date,
      buyUsdt: round2(buyU),
      buyThb: round2(buyThbMap[date] || 0),
      withdrawUsdt: round2(withdrawU),
      withdrawThb: round2(withdrawThbMap[date] || 0),
      transferUsdt: round2(transferU),
      transferThb: round2(transferThbMap[date] || 0),
      sellUsdt: round2(sellU),
      sellThb: round2(sellThbMap[date] || 0),
      cumulativeUsdt: round2(cumulativeUsdt),
      cumulativeThb: round2(cumulativeThb)
    });
  }

  const totals: SummaryTotals = rows.reduce<SummaryTotals>(
    (acc, row) => {
      acc.feeProfit = round2(acc.feeProfit + row.feeProfit);
      acc.feeCost = round2(acc.feeCost + row.feeCost);
      acc.moveTotal = round2(acc.moveTotal + row.moveTotal);
      acc.boDeposit = round2(acc.boDeposit + row.boDeposit);
      acc.bankDeposit = round2(acc.bankDeposit + row.bankDeposit);
      acc.boWithdraw = round2(acc.boWithdraw + row.boWithdraw);
      acc.bankWithdraw = round2(acc.bankWithdraw + row.bankWithdraw);
      acc.capitalIn = round2(acc.capitalIn + row.capitalIn);
      acc.capitalReturn = round2(acc.capitalReturn + row.capitalReturn);
      acc.accountDelta = round2(acc.accountDelta + row.accountDelta);
      acc.expense = round2(acc.expense + row.expense);
      return acc;
    },
    {
      feeProfit: 0,
      feeCost: 0,
      profit: 0,
      moveTotal: 0,
      boDeposit: 0,
      bankDeposit: 0,
      boWithdraw: 0,
      bankWithdraw: 0,
      capitalIn: 0,
      capitalReturn: 0,
      accountDelta: 0,
      expense: 0
    }
  );
  totals.profit = round2(totals.feeProfit + totals.feeCost);

  const cryptoTotals: SummaryCryptoTotals = cryptoRowsOut.reduce<SummaryCryptoTotals>(
    (acc, row) => {
      acc.buyUsdt = round2(acc.buyUsdt + row.buyUsdt);
      acc.buyThb = round2(acc.buyThb + row.buyThb);
      acc.withdrawUsdt = round2(acc.withdrawUsdt + row.withdrawUsdt);
      acc.withdrawThb = round2(acc.withdrawThb + row.withdrawThb);
      acc.transferUsdt = round2(acc.transferUsdt + row.transferUsdt);
      acc.transferThb = round2(acc.transferThb + row.transferThb);
      acc.sellUsdt = round2(acc.sellUsdt + row.sellUsdt);
      acc.sellThb = round2(acc.sellThb + row.sellThb);
      return acc;
    },
    {
      buyUsdt: 0,
      buyThb: 0,
      withdrawUsdt: 0,
      withdrawThb: 0,
      transferUsdt: 0,
      transferThb: 0,
      sellUsdt: 0,
      sellThb: 0,
      endingUsdt: 0,
      endingThb: 0
    }
  );
  cryptoTotals.endingUsdt = cryptoRowsOut.length ? cryptoRowsOut[cryptoRowsOut.length - 1].cumulativeUsdt : 0;
  cryptoTotals.endingThb = cryptoRowsOut.length ? cryptoRowsOut[cryptoRowsOut.length - 1].cumulativeThb : 0;

  return {
    success: true,
    month,
    rows,
    cryptoRows: cryptoRowsOut,
    totals,
    cryptoTotals
  };
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function prevDay(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
