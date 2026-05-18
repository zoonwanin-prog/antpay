import { bangkokDate } from "@/lib/dates";
import { getAuditData } from "@/lib/audit";
import { listRowsByMonth } from "@/lib/repositories";
import type { JsonRecord } from "@/lib/types";

export async function getDashboardSummary(targetDate = bangkokDate()) {
  const month = targetDate.slice(0, 7);
  const audit = await getAuditData(month);
  const day = audit.rows.find((row) => row.date === targetDate);
  const [transfers, crypto, expenses] = await Promise.all([
    listRowsByMonth<JsonRecord>("transfers", "date", month),
    listRowsByMonth<JsonRecord>("crypto_transactions", "date", month),
    listRowsByMonth<JsonRecord>("expenses", "date", month)
  ]);
  return {
    success: true,
    date: targetDate,
    auditDay: day || null,
    monthTotals: audit.totals,
    counts: {
      transfers: transfers.length,
      cryptoTransactions: crypto.length,
      expenses: expenses.length
    }
  };
}
