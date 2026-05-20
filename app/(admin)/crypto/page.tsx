import { connection } from "next/server";
import { CalendarRange, RefreshCw } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { CryptoManager } from "@/components/crypto-manager";
import { getCryptoSummaryUntil, getLatestRowDate, listLatestRowsPage, listMasterData, listRowsByDate } from "@/lib/repositories";

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

export default async function CryptoPage({ searchParams }: { searchParams: Promise<{ date?: string; page?: string }> }) {
  await connection();
  const params = await searchParams;
  const date = params.date ? normalizeDate(params.date) : (await getLatestRowDate("crypto_transactions", "date")) || today;
  const page = normalizePage(params.page);
  const [summaryRows, pagedRows, cryptoSummary, masterData] = await Promise.all([
    listRowsByDate("crypto_transactions", "date", date),
    listLatestRowsPage("crypto_transactions", "date", page, 20),
    getCryptoSummaryUntil(date),
    listMasterData()
  ]);
  return (
    <AdminShell
      active="crypto"
      title="คริปโต"
      description="บันทึกซื้อ ถอน โอน และขาย USDT สำหรับสรุปยอดรายวัน"
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
      <CryptoManager
        rows={pagedRows.rows}
        summaryRows={summaryRows}
        cryptoSummary={cryptoSummary}
        date={date}
        page={pagedRows.page}
        pageCount={pagedRows.pageCount}
        totalRows={pagedRows.total}
        bankAccounts={masterData.bankAccounts}
        cryptoAccounts={masterData.cryptoAccounts}
        users={masterData.users}
      />
    </AdminShell>
  );
}
