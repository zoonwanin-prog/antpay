import { connection } from "next/server";
import { CalendarRange, RefreshCw } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Bogo2PayManager } from "@/components/bogo2pay-manager";
import { getLatestRowDate, listMasterData, listRowsByDate } from "@/lib/repositories";

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

export default async function BoGo2PayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await connection();
  const params = await searchParams;
  const date = params.date ? normalizeDate(params.date) : (await getLatestRowDate("bogo2pay_transactions", "date")) || today;
  const [summaryRows, masterData] = await Promise.all([
    listRowsByDate("bogo2pay_transactions", "date", date),
    listMasterData()
  ]);
  return (
    <AdminShell
      active="bogo2pay"
      title="BoGo2pay"
      description="บันทึกยอดฝาก ถอน ค่าธรรมเนียม และยอดสุทธิจาก BO"
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
      <Bogo2PayManager
        rows={summaryRows}
        summaryRows={summaryRows}
        date={date}
        page={1}
        pageCount={1}
        totalRows={summaryRows.length}
        users={masterData.users}
      />
    </AdminShell>
  );
}
