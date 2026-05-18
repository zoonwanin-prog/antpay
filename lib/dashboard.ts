import { bangkokDate, round2 } from "@/lib/dates";
import { getAuditData } from "@/lib/audit";
import { listRecentRows, listRowsByDate, listRowsByMonth } from "@/lib/repositories";
import { getMonthlySummary } from "@/lib/summary";
import type { JsonRecord } from "@/lib/types";

export async function getDashboardSummary(targetDate = bangkokDate()) {
  const month = targetDate.slice(0, 7);
  const [audit, monthly, transfers, crypto, expenses, safeWalletRows, botLogs] = await Promise.all([
    getAuditData(month),
    getMonthlySummary(month),
    listRowsByMonth<JsonRecord>("transfers", "date", month),
    listRowsByMonth<JsonRecord>("crypto_transactions", "date", month),
    listRowsByMonth<JsonRecord>("expenses", "date", month),
    listRowsByDate<JsonRecord>("safewallet_transactions", "date", targetDate),
    listRecentRows<JsonRecord>("bot_logs", "created_at", 20)
  ]);
  const day = audit.rows.find((row) => row.date === targetDate);
  const summaryDay = monthly.rows.find((row) => row.date === targetDate) || null;
  const cryptoDay = monthly.cryptoRows.find((row) => row.date === targetDate) || null;
  const safeWalletLog = botLogs.find((row) => String(row.job || "").toLowerCase().includes("safewallet")) || null;

  return {
    success: true,
    date: targetDate,
    auditDay: day || null,
    summaryDay,
    cryptoDay,
    safeWallet: {
      count: safeWalletRows.length,
      amount: round2(safeWalletRows.reduce((total, row) => total + Number(row.amount_thb || row.amount || 0), 0)),
      fee: round2(safeWalletRows.reduce((total, row) => total + Number(row.fee_amount || 0), 0)),
      net: round2(safeWalletRows.reduce((total, row) => total + Number(row.net_thb || 0), 0))
    },
    sync: safeWalletLog ? {
      job: String(safeWalletLog.job || "SafeWallet sync"),
      date: String(safeWalletLog.date || ""),
      time: String(safeWalletLog.time || ""),
      status: String(safeWalletLog.status || ""),
      scanned: Number(safeWalletLog.scanned || 0),
      inserted: Number(safeWalletLog.inserted || 0)
    } : null,
    monthTotals: audit.totals,
    counts: {
      transfers: transfers.length,
      cryptoTransactions: crypto.length,
      expenses: expenses.length
    }
  };
}
