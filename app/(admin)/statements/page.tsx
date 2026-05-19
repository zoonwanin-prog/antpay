import { connection } from "next/server";
import { CalendarRange, FileText, RefreshCw } from "lucide-react";
import { AdminShell, MetricCard } from "@/components/admin-shell";
import { normalizeMonth } from "@/lib/dates";
import { listStatementDaily } from "@/lib/repositories";
import type { StatementDailyRow } from "@/lib/types";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function accountKey(row: StatementDailyRow) {
  return `${row.bank}::${row.account_no}`;
}

function accountLabel(row: StatementDailyRow) {
  return `${row.bank} ${row.account_no}`;
}

function latestBalanceTotal(rows: StatementDailyRow[]) {
  const latestByAccount = new Map<string, StatementDailyRow>();
  for (const row of rows) {
    const key = accountKey(row);
    const current = latestByAccount.get(key);
    if (!current || row.date > current.date) latestByAccount.set(key, row);
  }
  return Array.from(latestByAccount.values()).reduce((sum, row) => sum + Number(row.ending_balance || 0), 0);
}

export default async function StatementsPage({ searchParams }: { searchParams: Promise<{ month?: string; account?: string }> }) {
  await connection();
  const params = await searchParams;
  const month = normalizeMonth(params.month);
  const selectedAccount = params.account || "all";
  let rows: StatementDailyRow[] = [];
  let setupError = "";
  try {
    rows = await listStatementDaily(month);
  } catch (error) {
    setupError = error instanceof Error ? error.message : "ยังไม่สามารถโหลดข้อมูลได้";
  }
  const accountOptions = Array.from(
    new Map(rows.map((row) => [accountKey(row), { value: accountKey(row), label: accountLabel(row) }])).values()
  ).sort((a, b) => a.label.localeCompare(b.label));
  const visibleRows = selectedAccount === "all" ? rows : rows.filter((row) => accountKey(row) === selectedAccount);
  const selectedAccountLabel = selectedAccount === "all"
    ? "ทุกบัญชี"
    : accountOptions.find((option) => option.value === selectedAccount)?.label || "ทุกบัญชี";
  const depositTotal = visibleRows.reduce((sum, row) => sum + Number(row.deposit_total || 0), 0);
  const withdrawTotal = visibleRows.reduce((sum, row) => sum + Number(row.withdraw_total || 0), 0);
  const feeTotal = visibleRows.reduce((sum, row) => sum + Number(row.fee_total || 0), 0);
  const balanceTotal = latestBalanceTotal(visibleRows);
  return (
    <AdminShell
      active="statements"
      title="สเตทเม้นธนาคาร"
      description="สรุปฝาก ถอน Fee และยอดคงเหลือจาก statement รายวัน"
      actions={
        <form method="get" className="month-filter statement-filter">
          <CalendarRange size={16} aria-hidden="true" />
          <label className="statement-month-picker">
            <span>เดือน</span>
            <input type="month" name="month" defaultValue={month} aria-label="เลือกเดือน" />
          </label>
          <select name="account" defaultValue={selectedAccount} aria-label="เลือกบัญชี">
            <option value="all">ทุกบัญชี</option>
            {accountOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button type="submit">
            <RefreshCw size={14} />
            <span>โหลดสรุป</span>
          </button>
        </form>
      }
    >
      {setupError ? (
        <div className="msg msg-error msg-block">
          <span>{setupError}</span>
        </div>
      ) : null}
      <section className="panel statement-overview-panel">
        <div className="statement-overview-header">
          <div>
            <h2>บัญชีธนาคารในระบบ</h2>
            <p>สรุปเดือน {month} | {selectedAccountLabel}</p>
          </div>
          <FileText size={22} aria-hidden="true" />
        </div>
        <section className="grid compact-card-grid statement-card-grid">
          <MetricCard label="ฝากรวม" value={money.format(depositTotal)} tone="good" />
          <MetricCard label="ถอนรวม" value={money.format(withdrawTotal)} tone="bad" />
          <MetricCard label="Fee Statement" value={money.format(feeTotal)} tone="warn" />
          <MetricCard label="ยอดเงินคงเหลือ" value={money.format(balanceTotal)} tone="good" />
        </section>
        <p className="statement-source-note">
          ข้อมูลจาก table <strong>statements</strong> | พบ {visibleRows.length} แถว
        </p>
      </section>
      <section className="panel statement-shell is-stack">
        <div className="panel-header">
          <div>
            <h2>Statement รายวัน</h2>
            <p>สรุปรายวันจากรายการ statement โดยถอนรวม = ถอน + Fee | {selectedAccountLabel}</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>วันที่</th>
                <th>ธนาคาร</th>
                <th>เลขบัญชี</th>
                <th className="num">ฝากรวม</th>
                <th className="num">ถอนรวม</th>
                <th className="num">Fee</th>
                <th className="num">ยอดคงเหลือ</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">ยังไม่มี statement ของเดือนนี้</div>
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr key={`${row.date}-${row.account_no}`}>
                    <td>{row.date}</td>
                    <td>{row.bank}</td>
                    <td>{row.account_no}</td>
                    <td className="num">{money.format(row.deposit_total)}</td>
                    <td className="num">{money.format(row.withdraw_total)}</td>
                    <td className="num">{money.format(row.fee_total)}</td>
                    <td className="num">{money.format(row.ending_balance)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {visibleRows.length ? (
              <tfoot>
                <tr className="statement-total-row">
                  <td colSpan={3}>รวม</td>
                  <td className="num">{money.format(depositTotal)}</td>
                  <td className="num">{money.format(withdrawTotal)}</td>
                  <td className="num">{money.format(feeTotal)}</td>
                  <td className="num">{money.format(balanceTotal)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
