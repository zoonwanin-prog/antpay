import { connection } from "next/server";
import { CalendarRange, RefreshCw } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { StatementTools } from "@/components/statement-tools";
import { normalizeMonth } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function StatementSearchPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await connection();
  const params = await searchParams;
  const month = normalizeMonth(params.month);
  return (
    <AdminShell
      active="statementSearch"
      title="ค้นหาจาก Statement"
      description="ค้นหายอด statement รายวันจากธนาคารและเลขบัญชี"
      actions={
        <form method="get" className="month-filter">
          <CalendarRange size={16} aria-hidden="true" />
          <input type="month" name="month" defaultValue={month} aria-label="เลือกเดือน" />
          <button type="submit">
            <RefreshCw size={14} />
            <span>เลือกเดือน</span>
          </button>
        </form>
      }
    >
      <StatementTools month={month} mode="statement-search" />
    </AdminShell>
  );
}
