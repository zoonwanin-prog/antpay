import { connection } from "next/server";
import { CalendarRange, RefreshCw } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { SafeWalletManager } from "@/components/safewallet-manager";
import { getLatestRowDate, listLatestRowsPage, listRowsByDate, listRowsByMonth } from "@/lib/repositories";

export const dynamic = "force-dynamic";

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date());

function normalizeDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : today;
}

function normalizePage(value?: string) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

export default async function SafeWalletPage({ searchParams }: { searchParams: Promise<{ date?: string; page?: string }> }) {
  await connection();
  const params = await searchParams;
  const date = params.date ? normalizeDate(params.date) : (await getLatestRowDate("safewallet_transactions", "date")) || today;
  const page = normalizePage(params.page);
  const [summaryRows, monthRows, pagedRows] = await Promise.all([
    listRowsByDate("safewallet_transactions", "date", date),
    listRowsByMonth("safewallet_transactions", "date", date.slice(0, 7)),
    listLatestRowsPage("safewallet_transactions", "date", page, 20)
  ]);
  return (
    <AdminShell
      active="safewallet"
      title="SafeWallet"
      description="ติดตามรายการและสถานะ SafeWallet"
      actions={
        <form method="get" className="date-filter transfer-date-filter">
          <CalendarRange size={16} aria-hidden="true" />
          <strong>เลือกวันที่สรุปผล:</strong>
          <input type="date" name="date" defaultValue={date} aria-label="เลือกวันที่" />
          <button type="submit">
            <RefreshCw size={14} />
            <span>แสดงผล</span>
          </button>
        </form>
      }
    >
      <SafeWalletManager
        rows={pagedRows.rows}
        summaryRows={summaryRows}
        monthRows={monthRows}
        date={date}
        page={pagedRows.page}
        pageCount={pagedRows.pageCount}
        totalRows={pagedRows.total}
      />
    </AdminShell>
  );
}
