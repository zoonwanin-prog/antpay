import { connection } from "next/server";
import {
  Banknote,
  Building2,
  CalendarRange,
  CircleMinus,
  CirclePlus,
  Layers,
  ReceiptText,
  RefreshCw,
  Search
} from "lucide-react";
import { AdminShell, MetricCard } from "@/components/admin-shell";
import { AuditFailedList } from "@/components/audit-failed-list";
import { AuditTelegramButton } from "@/components/audit-telegram-button";
import { getAuditAccountBreakdown, getAuditData } from "@/lib/audit";
import { bangkokDate } from "@/lib/dates";
import type { AuditRow } from "@/lib/types";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdt = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 6 });

function ddmmyyyy(date: string) {
  if (!date || date.length < 10) return date;
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

function normalizeDate(value?: string | null) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return bangkokDate();
}

function emptyDayRow(date: string): AuditRow {
  return {
    date,
    openingBalance: 0,
    bankDeposit: 0,
    bankWithdraw: 0,
    statementFee: 0,
    sheetExpense: 0,
    expectedBalance: 0,
    actualBalance: 0,
    diffBank: 0,
    boDeposit: 0,
    diffDeposit: 0,
    boWithdraw: 0,
    failedWithdraw: 0,
    failedWithdrawCount: 0,
    failedWithdrawPaid: 0,
    failedWithdrawPaidCount: 0,
    failedWithdrawPending: 0,
    failedWithdrawPendingCount: 0,
    failedWithdrawDetails: [],
    diffWithdraw: 0,
    transferOnly: 0,
    settlement: 0,
    errorFollowTransfer: 0,
    otherTransfer: 0,
    capitalIn: 0,
    capitalReturn: 0,
    buyUSDTthb: 0,
    buyUSDT: 0,
    moveTotal: 0,
    status: "ยังไม่มีข้อมูล"
  };
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ date?: string; month?: string }> }) {
  await connection();
  const params = await searchParams;
  const date = normalizeDate(params.date);
  const month = date.slice(0, 7);

  let audit: Awaited<ReturnType<typeof getAuditData>> | null = null;
  let breakdown: Awaited<ReturnType<typeof getAuditAccountBreakdown>> = [];
  let setupError = "";
  try {
    [audit, breakdown] = await Promise.all([
      getAuditData(month),
      getAuditAccountBreakdown(date)
    ]);
  } catch (error) {
    setupError = error instanceof Error ? error.message : "ยังไม่สามารถโหลดข้อมูลได้";
  }

  if (!audit) {
    return (
      <AdminShell active="audit" title="Audit ปิดยอด" description="ตรวจสอบ Diff ธนาคาร / ฝาก / ถอน รายวัน">
        <div className="card">
          <h2>ไม่สามารถแสดงข้อมูลได้</h2>
          <p>{setupError || "กรุณาตรวจสอบการตั้งค่าระบบ"}</p>
        </div>
      </AdminShell>
    );
  }

  const dayRow: AuditRow = audit.rows.find((row) => row.date === date) || emptyDayRow(date);

  // อ้างอิงและสรุป Diff ถอนหลังหักยอด
  const totalReference = dayRow.transferOnly + dayRow.settlement + dayRow.errorFollowTransfer + dayRow.otherTransfer + dayRow.buyUSDTthb;
  const totalExpenseAll = dayRow.statementFee + dayRow.sheetExpense;
  const finalDiffWithdraw = dayRow.diffWithdraw - dayRow.failedWithdrawPaid - totalExpenseAll - totalReference;

  return (
    <AdminShell
      active="audit"
      title="Audit ปิดยอด"
      description={`ตรวจสอบยอดวันที่ ${ddmmyyyy(date)}`}
      actions={
        <>
          <form method="get" className="month-filter">
            <CalendarRange size={16} aria-hidden="true" />
            <input type="date" name="date" defaultValue={date} aria-label="เลือกวัน" />
            <button type="submit">
              <RefreshCw size={14} />
              <span>โหลด Audit</span>
            </button>
          </form>
          <AuditTelegramButton date={date} />
        </>
      }
    >
      <section className="grid audit-metric-grid">
        <MetricCard
          label="ธนาคาร"
          value={money.format(dayRow.diffBank)}
          tone={Math.abs(dayRow.diffBank) > 1 ? "bad" : "good"}
          hint="ปิดยอดไม่ตรง"
          icon={<Building2 size={18} />}
        />
        <MetricCard
          label="ฝาก"
          value={money.format(dayRow.diffDeposit)}
          tone={Math.abs(dayRow.diffDeposit) > 1 ? "warn" : "good"}
          hint={dayRow.diffDeposit === 0 ? "ฝากปกติ" : "ตรวจฝาก BO"}
          icon={<CirclePlus size={18} />}
        />
        <MetricCard
          label="ถอน"
          value={money.format(dayRow.diffWithdraw)}
          tone={dayRow.diffWithdraw > 1 ? "bad" : "good"}
          hint="ตรวจถอนเทียบ BO"
          icon={<CircleMinus size={18} />}
        />
      </section>

      <section className="panel is-stack audit-day-panel">
        <div className="panel-header">
          <div>
            <h2><Search size={16} /> รายละเอียดการคำนวณวันที่ {ddmmyyyy(date)}</h2>
            <p>เปรียบเทียบยอดจาก Statement ธนาคารกับยอดในระบบ BO</p>
          </div>
        </div>
        <div className="audit-calc-grid">
          <div className="audit-calc-box">
            <div className="audit-calc-title">
              <Building2 size={17} />
              <span>ธนาคาร</span>
            </div>
            <div className="summary-split-list">
              <div className="summary-split-row"><span>เงินตั้งต้น</span><strong>{money.format(dayRow.openingBalance)}</strong></div>
              <div className="summary-split-row"><span>+ ฝากธนาคาร</span><strong>{money.format(dayRow.bankDeposit)}</strong></div>
              <div className="summary-split-row"><span>- ถอนธนาคาร</span><strong>{money.format(dayRow.bankWithdraw)}</strong></div>
              <div className="summary-split-row"><span>เงินควรเหลือ</span><strong>{money.format(dayRow.expectedBalance)}</strong></div>
              <div className="summary-split-row"><span>เงินในบัญชีจริง</span><strong>{money.format(dayRow.actualBalance)}</strong></div>
              <div className="summary-split-row"><span>Diff ธนาคาร</span><strong className="audit-diff-value">{money.format(dayRow.diffBank)}</strong></div>
            </div>
          </div>
          <div className="audit-calc-box">
            <div className="audit-calc-title">
              <CirclePlus size={17} />
              <span>ฝาก</span>
            </div>
            <div className="summary-split-list">
              <div className="summary-split-row"><span>ฝากธนาคาร</span><strong>{money.format(dayRow.bankDeposit)}</strong></div>
              <div className="summary-split-row"><span>- ฝาก BO</span><strong>{money.format(dayRow.boDeposit)}</strong></div>
              <div className="summary-split-row"><span>Diff ฝาก</span><strong className="audit-diff-value">{money.format(dayRow.diffDeposit)}</strong></div>
            </div>
            <p className="audit-calc-note">
              ถ้า Diff ฝากติดลบ แปลว่าฝาก BO มากกว่าธนาคาร
            </p>
          </div>
          <div className="audit-calc-box">
            <div className="audit-calc-title">
              <CircleMinus size={17} />
              <span>ถอน</span>
            </div>
            <div className="summary-split-list">
              <div className="summary-split-row"><span>ถอน BO ที่ต้องโอนทั้งหมด</span><strong>{money.format(dayRow.boWithdraw)}</strong></div>
              <div className="summary-split-row"><span>ถอนไม่สำเร็จ (ต้องโอนตาม)</span><strong>{money.format(dayRow.failedWithdraw)}</strong></div>
              <div className="summary-split-row"><span>จำนวนรายการไม่สำเร็จ</span><strong>{dayRow.failedWithdrawCount} รายการ</strong></div>
              <div className="summary-split-row"><span>โอนตามแล้ว</span><strong>{dayRow.failedWithdrawPaidCount} รายการ / {money.format(dayRow.failedWithdrawPaid)}</strong></div>
              <div className="summary-split-row"><span>ค้างโอนตาม</span><strong>{dayRow.failedWithdrawPendingCount} รายการ / {money.format(dayRow.failedWithdrawPending)}</strong></div>
              <div className="summary-split-row"><span>ถอนธนาคาร</span><strong>{money.format(dayRow.bankWithdraw)}</strong></div>
              <div className="summary-split-row"><span>Diff ถอน</span><strong className="audit-diff-value">{money.format(dayRow.diffWithdraw)}</strong></div>
            </div>
            <div className="audit-final-diff">
              <p className="audit-final-title">หายอด Diff ถอนหลังหักรายการที่อธิบายได้</p>
              <p>Diff ถอน: {money.format(dayRow.diffWithdraw)}</p>
              <p>- ถอนไม่สำเร็จที่โอนแล้ว: {money.format(dayRow.failedWithdrawPaid)} ({dayRow.failedWithdrawPaidCount} รายการ)</p>
              <p>- รายจ่ายจากชีท: {money.format(dayRow.sheetExpense)}</p>
              <p>- Fee ค่าธรรมเนียม: {money.format(dayRow.statementFee)}</p>
              <p>- ยอดอ้างอิงทั้งหมด: {money.format(totalReference)}</p>
              <p className="audit-final-result">สรุป Diff ถอนหลังหักยอดอธิบาย: <strong>{money.format(finalDiffWithdraw)}</strong></p>
            </div>
          </div>
        </div>
      </section>

      <section className="panel is-stack audit-day-panel">
        <div className="panel-header">
          <div>
            <h2><Layers size={16} /> แยกรายบัญชี</h2>
            <p>ยอดแต่ละบัญชีจาก bank_statement_daily ของวันที่เลือก</p>
          </div>
        </div>
        {breakdown.length === 0 ? (
          <div className="empty-state">ยังไม่มี Statement ของวันนี้</div>
        ) : (
          <div className="audit-account-list">
            {breakdown.map((acc) => (
              <div className="audit-account-card" key={`${acc.bank}-${acc.accountNo}`}>
                <div className="audit-account-title">
                  <Banknote size={16} />
                  <span>{acc.bank} - {acc.accountNo}</span>
                </div>
                <div className="summary-split-list">
                  <div className="summary-split-row"><span>เงินตั้งต้น</span><strong>{money.format(acc.openingBalance)}</strong></div>
                  <div className="summary-split-row"><span>+ ฝากธนาคาร</span><strong>{money.format(acc.deposit)}</strong></div>
                  <div className="summary-split-row"><span>- ถอนธนาคาร</span><strong>{money.format(acc.withdraw)}</strong></div>
                  <div className="summary-split-row"><span>Fee Statement</span><strong>{money.format(acc.fee)}</strong></div>
                  <div className="summary-split-row"><span>เงินควรเหลือ</span><strong>{money.format(acc.expectedBalance)}</strong></div>
                  <div className="summary-split-row"><span>ยอดคงเหลือ Statement</span><strong>{money.format(acc.endingBalance)}</strong></div>
                  <div className="summary-split-row"><span>Diff บัญชี</span><strong className="audit-diff-value">{money.format(acc.diff)}</strong></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel is-stack audit-day-panel">
        <div className="panel-header">
          <div>
            <h2><Search size={16} /> ตรวจรายการถอนไม่สำเร็จที่ถูกทับ</h2>
            <p>กดเปลี่ยนสถานะ "โอนตามแล้ว" ได้ทันที</p>
          </div>
        </div>
        <AuditFailedList items={dayRow.failedWithdrawDetails} />
      </section>

      <section className="panel is-stack audit-day-panel">
        <div className="panel-header">
          <div>
            <h2><ReceiptText size={16} /> รายจ่ายและยอดอ้างอิง</h2>
            <p>รายจ่ายและรายการที่ใช้อธิบาย Diff ถอน</p>
          </div>
        </div>
        <div className="audit-ref-list">
          <div className="audit-ref-row"><span>ธุรกรรมจ่าย</span><strong>{money.format(dayRow.sheetExpense)}</strong></div>
          <div className="audit-ref-row"><span>Fee Statement</span><strong>{money.format(dayRow.statementFee)}</strong></div>
          <div className="audit-ref-row audit-ref-strong"><span>รายจ่ายรวม</span><strong>{money.format(totalExpenseAll)}</strong></div>
          <div className="audit-ref-row"><span>โยกเงิน</span><strong>{money.format(dayRow.transferOnly)}</strong></div>
          <div className="audit-ref-row"><span>โอน Settlement</span><strong>{money.format(dayRow.settlement)}</strong></div>
          <div className="audit-ref-row"><span>โอนตามยอดerror</span><strong>{money.format(dayRow.errorFollowTransfer)}</strong></div>
          <div className="audit-ref-row"><span>อื่นๆ</span><strong>{money.format(dayRow.otherTransfer)}</strong></div>
          <div className="audit-ref-row"><span>เติมทุน</span><strong>{money.format(dayRow.capitalIn)}</strong></div>
          <div className="audit-ref-row"><span>คืนทุน</span><strong>{money.format(dayRow.capitalReturn)}</strong></div>
          <div className="audit-ref-row">
            <span>ซื้อ USDT</span>
            <strong>{money.format(dayRow.buyUSDTthb)} ({usdt.format(dayRow.buyUSDT)} USDT)</strong>
          </div>
          <div className="audit-ref-row audit-ref-strong"><span>รวมยอดอ้างอิง</span><strong>{money.format(totalReference)}</strong></div>
        </div>
      </section>

      <section className="panel is-stack audit-day-panel">
        <div className="panel-header">
          <div>
            <h2>ตารางสรุป Diff แต่ละวัน</h2>
            <p>ภาพรวมการปิดยอดของทั้งเดือน {month}</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="audit-month-table">
            <thead>
              <tr>
                <th>วันที่</th>
                <th className="num">Diff ธนาคาร</th>
                <th className="num">Diff ฝาก</th>
                <th className="num">Diff ถอนหลังหักยอดอธิบาย</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {audit.rows.length === 0 ? (
                <tr><td colSpan={5}><div className="empty-state">ยังไม่มีข้อมูลในเดือนนี้</div></td></tr>
              ) : (
                audit.rows.map((row) => {
                  const refSum = row.transferOnly + row.settlement + row.errorFollowTransfer + row.otherTransfer + row.buyUSDTthb;
                  const expenseSum = row.statementFee + row.sheetExpense;
                  const finalDiff = row.diffWithdraw - row.failedWithdrawPaid - expenseSum - refSum;
                  return (
                    <tr key={row.date}>
                      <td>{ddmmyyyy(row.date)}</td>
                      <td className="num">{money.format(row.diffBank)}</td>
                      <td className="num">{money.format(row.diffDeposit)}</td>
                      <td className="num">{money.format(finalDiff)}</td>
                      <td>
                        <span className={row.status === "ปิดตรง" ? "audit-pill ok" : "audit-pill warn"}>{row.status}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
