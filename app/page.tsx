import { connection } from "next/server";
import { Activity, ArrowDownToLine, ArrowUpFromLine, CircleAlert, Database, Landmark } from "lucide-react";
import { AdminShell, MetricCard } from "@/components/admin-shell";
import { getDashboardSummary } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function DashboardPage() {
  await connection();
  let summary: Awaited<ReturnType<typeof getDashboardSummary>> | null = null;
  let setupError = "";
  try {
    summary = await getDashboardSummary();
  } catch (error) {
    setupError = error instanceof Error ? error.message : "ยังไม่สามารถโหลดข้อมูลได้";
  }
  if (!summary) {
    return (
      <AdminShell active="dashboard" title="Dashboard" description="ภาพรวมระบบหลังบ้าน">
        <div className="card">
          <h2>ไม่สามารถแสดงข้อมูลได้</h2>
          <p>{setupError || "กรุณาตรวจสอบการตั้งค่าระบบ"}</p>
        </div>
      </AdminShell>
    );
  }
  const day = summary.auditDay;
  return (
    <AdminShell
      active="dashboard"
      title="Dashboard"
      description={`ภาพรวมประจำวันที่ ${summary.date}`}
      actions={
        <div className="summary-row">
          <span>สถานะ</span>
          <strong>{day?.status || "รอข้อมูล"}</strong>
        </div>
      }
    >
      <section className="hero-card">
        <div>
          <h2>Dashboard Summary</h2>
          <p>ภาพรวมเงินในบัญชีจริงและสถานะ Audit ล่าสุดของระบบ Go2payBo</p>
          <div className="hero-value">{money.format(day?.actualBalance || 0)}</div>
        </div>
        <div className="hero-subgrid">
          <div className="hero-stat">
            <span>Diff ธนาคาร</span>
            <strong>{money.format(day?.diffBank || 0)}</strong>
          </div>
          <div className="hero-stat">
            <span>สถานะปิดยอด</span>
            <strong>{day?.status || "รอข้อมูล"}</strong>
          </div>
          <div className="hero-stat">
            <span>วันที่</span>
            <strong>{summary.date}</strong>
          </div>
        </div>
      </section>
      <section className="grid dashboard-metric-grid">
        <MetricCard label="ฝากธนาคารวันนี้" value={money.format(day?.bankDeposit || 0)} tone="good" icon={<ArrowDownToLine size={18} />} />
        <MetricCard label="ถอนธนาคารวันนี้" value={money.format(day?.bankWithdraw || 0)} tone="warn" icon={<ArrowUpFromLine size={18} />} />
        <MetricCard label="เงินในบัญชีจริง" value={money.format(day?.actualBalance || 0)} icon={<Landmark size={18} />} />
        <MetricCard label="Diff ธนาคาร" value={money.format(day?.diffBank || 0)} tone={Math.abs(day?.diffBank || 0) > 1 ? "bad" : "good"} icon={<Activity size={18} />} />
        <MetricCard label="ถอนไม่สำเร็จค้างโอน" value={money.format(day?.failedWithdrawPending || 0)} tone="bad" icon={<CircleAlert size={18} />} />
        <MetricCard label="รายการเดือนนี้" value={String(summary.counts.transfers + summary.counts.cryptoTransactions + summary.counts.expenses)} icon={<Database size={18} />} />
      </section>
      <section className="dashboard-layout">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Audit Snapshot</h2>
              <p>ยอดสำคัญของวันที่เลือก</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>รายการ</th>
                  <th className="num">ยอด</th>
                  <th>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>เงินควรเหลือ</td><td className="num">{money.format(day?.expectedBalance || 0)}</td><td>จากสูตรปิดยอดธนาคาร</td></tr>
                <tr><td>Diff ฝาก</td><td className="num">{money.format(day?.diffDeposit || 0)}</td><td>ฝากธนาคาร - ฝาก BO</td></tr>
                <tr><td>Diff ถอน</td><td className="num">{money.format(day?.diffWithdraw || 0)}</td><td>ถอนธนาคาร - ถอน BO</td></tr>
                <tr><td>ซื้อ USDT</td><td className="num">{money.format(day?.buyUSDTthb || 0)}</td><td>{money.format(day?.buyUSDT || 0)} USDT</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <aside className="panel">
          <div className="panel-header">
            <div>
              <h2>สรุปยอดเดือนนี้</h2>
              <p>ยอดรวมรายการในเดือนปัจจุบัน</p>
            </div>
          </div>
          <div className="summary-list">
            <div className="summary-row"><span>ฝากธนาคาร</span><strong>{money.format(summary.monthTotals.bankDeposit || 0)}</strong></div>
            <div className="summary-row"><span>ถอนธนาคาร</span><strong>{money.format(summary.monthTotals.bankWithdraw || 0)}</strong></div>
            <div className="summary-row"><span>Bo ฝาก</span><strong>{money.format(summary.monthTotals.boDeposit || 0)}</strong></div>
            <div className="summary-row"><span>Bo ถอน</span><strong>{money.format(summary.monthTotals.boWithdraw || 0)}</strong></div>
          </div>
        </aside>
      </section>
    </AdminShell>
  );
}
