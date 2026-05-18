import { connection } from "next/server";
import { CalendarRange, Coins, PiggyBank, RefreshCw, TrendingUp } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { bangkokDate } from "@/lib/dates";
import { getMonthlySummary } from "@/lib/summary";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdt = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 6 });

function ddmmyyyy(date: string) {
  if (!date || date.length < 10) return date;
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

function hasDailyMovement(row: Awaited<ReturnType<typeof getMonthlySummary>>["rows"][number]) {
  return [
    row.feeProfit,
    row.feeCost,
    row.boDeposit,
    row.bankDeposit,
    row.boWithdraw,
    row.bankWithdraw,
    row.moveTotal,
    row.capitalIn,
    row.capitalReturn,
    row.expense
  ].some((value) => Math.abs(value) > 0.000001);
}

function hasCryptoMovement(row: Awaited<ReturnType<typeof getMonthlySummary>>["cryptoRows"][number]) {
  return [
    row.buyUsdt,
    row.buyThb,
    row.withdrawUsdt,
    row.withdrawThb,
    row.transferUsdt,
    row.transferThb,
    row.sellUsdt,
    row.sellThb
  ].some((value) => Math.abs(value) > 0.000001);
}

export default async function SummaryPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await connection();
  const params = await searchParams;
  let summary: Awaited<ReturnType<typeof getMonthlySummary>> | null = null;
  let setupError = "";
  try {
    summary = await getMonthlySummary(params.month);
  } catch (error) {
    setupError = error instanceof Error ? error.message : "ยังไม่สามารถโหลดข้อมูลได้";
  }

  if (!summary) {
    return (
      <AdminShell active="summary" title="สรุปผลประกอบการรายเดือน" description="ค่าธรรมเนียม กำไร และยอดโอน">
        <div className="card">
          <h2>ไม่สามารถแสดงข้อมูลได้</h2>
          <p>{setupError || "กรุณาตรวจสอบการตั้งค่าระบบ"}</p>
        </div>
      </AdminShell>
    );
  }

  const monthLabel = formatMonth(summary.month);
  const { totals, cryptoTotals, rows, cryptoRows } = summary;
  const today = bangkokDate();
  const displayRows = rows.filter((row) => row.date <= today && hasDailyMovement(row));
  const displayCryptoRows = cryptoRows.filter((row) => row.date <= today && hasCryptoMovement(row));
  const visibleCryptoTotals = displayCryptoRows.reduce(
    (acc, row) => ({
      buyUsdt: acc.buyUsdt + row.buyUsdt,
      buyThb: acc.buyThb + row.buyThb,
      withdrawUsdt: acc.withdrawUsdt + row.withdrawUsdt,
      withdrawThb: acc.withdrawThb + row.withdrawThb,
      transferUsdt: acc.transferUsdt + row.transferUsdt,
      transferThb: acc.transferThb + row.transferThb,
      endingUsdt: row.cumulativeUsdt,
      endingThb: row.cumulativeThb
    }),
    {
      buyUsdt: 0,
      buyThb: 0,
      withdrawUsdt: 0,
      withdrawThb: 0,
      transferUsdt: 0,
      transferThb: 0,
      endingUsdt: cryptoTotals.endingUsdt,
      endingThb: cryptoTotals.endingThb
    }
  );

  return (
    <AdminShell
      active="summary"
      title="สรุปผลประกอบการรายเดือน"
      description={`ข้อมูลของเดือน ${monthLabel}`}
      actions={
        <form method="get" className="month-filter">
          <CalendarRange size={16} aria-hidden="true" />
          <input type="month" name="month" defaultValue={summary.month} aria-label="เลือกเดือน" />
          <button type="submit">
            <RefreshCw size={14} />
            <span>โหลดสรุป</span>
          </button>
        </form>
      }
    >
      <section className="grid summary-headline-grid">
        <div className="card metric-card tone-good summary-headline-card">
          <div className="metric-top">
            <div>
              <p className="metric">กำไรรวม</p>
              <p className="metric-hint">กำไรค่าธรรมเนียม + ค่าธรรมเนียม SafeWallet</p>
            </div>
            <span className="metric-icon"><TrendingUp size={18} /></span>
          </div>
          <p className="value">{money.format(totals.profit)}</p>
        </div>
        <div className="card metric-card tone-blue summary-headline-card">
          <div className="metric-top">
            <div>
              <p className="metric">ยอดโอนเงินรวม (โยก + SETTLE + ซื้อ USDT)</p>
              <p className="metric-hint">นับเฉพาะธุรกรรมในเดือน</p>
            </div>
            <span className="metric-icon"><PiggyBank size={18} /></span>
          </div>
          <p className="value">{money.format(totals.moveTotal)}</p>
        </div>
      </section>

      <section className="panel is-stack summary-panel">
        <div className="panel-header">
          <div>
            <h2>ตารางสรุปรายวัน</h2>
            <p>กำไร ค่าธรรมเนียม ฝาก-ถอน โอนเงิน ยอด wallet และรายจ่ายแยกแต่ละวัน</p>
          </div>
        </div>
        <div className="table-wrap summary-table-wrap">
          <table className="summary-table">
            <thead>
              <tr>
                <th>วันที่</th>
                <th className="num">
                  <span className="th-stack">
                    <em>กำไรค่าธรรมเนียม</em>
                    <em className="muted">ค่าธรรมเนียม SafeWallet</em>
                  </span>
                </th>
                <th className="num">
                  <span className="th-stack">
                    <em>ฝาก BO</em>
                    <em className="muted">ฝากธนาคาร</em>
                  </span>
                </th>
                <th className="num">
                  <span className="th-stack">
                    <em>ถอน BO</em>
                    <em className="muted">ถอนธนาคาร</em>
                  </span>
                </th>
                <th className="num">โอนเงินรวม</th>
                <th className="num">
                  <span className="th-stack">
                    <em>Main + Payout</em>
                    <em className="muted">SafeWallet</em>
                    <em className="muted">Frozen</em>
                  </span>
                </th>
                <th className="num">
                  <span className="th-stack">
                    <em>เติมทุน</em>
                    <em className="muted">คืนทุน</em>
                  </span>
                </th>
                <th className="num">
                  <span className="th-stack">
                    <em>เงินในบัญชี</em>
                    <em className="muted">บวกเข้า-บวกถอน</em>
                  </span>
                </th>
                <th className="num">รายจ่าย</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">ยังไม่มีข้อมูลในเดือนนี้</div>
                  </td>
                </tr>
              ) : (
                displayRows.map((row) => (
                  <tr key={row.date}>
                    <td>{ddmmyyyy(row.date)}</td>
                    <td className="num">
                      <div className="td-stack divided-stack">
                        <span className="td-strong td-orange">{money.format(row.feeProfit)}</span>
                        <span className="td-muted td-info">{money.format(row.feeCost)}</span>
                      </div>
                    </td>
                    <td className="num">
                      <div className="td-stack divided-stack">
                        <span className="td-strong td-good">{money.format(row.boDeposit)}</span>
                        <span className="td-muted td-info">{money.format(row.bankDeposit)}</span>
                      </div>
                    </td>
                    <td className="num">
                      <div className="td-stack divided-stack">
                        <span className="td-strong td-bad">{money.format(row.boWithdraw)}</span>
                        <span className="td-muted td-purple">{money.format(row.bankWithdraw)}</span>
                      </div>
                    </td>
                    <td className="num">{money.format(row.moveTotal)}</td>
                    <td className="num">
                      <div className="td-stack wallet-stack">
                        <span className="td-strong td-good">{money.format(row.mainPayoutBalance)}</span>
                        <span className="td-muted td-info">{money.format(row.safeWalletBalance)} USDT</span>
                        <span className="td-muted td-purple">{money.format(row.frozenBalance)}</span>
                      </div>
                    </td>
                    <td className="num">
                      <div className="td-stack divided-stack">
                        <span className="td-strong td-bad">-{money.format(row.capitalIn)}</span>
                        <span className="td-muted td-info">-{money.format(row.capitalReturn)}</span>
                        <span className="td-muted td-good">สุทธิ {money.format(row.capitalIn - row.capitalReturn)}</span>
                      </div>
                    </td>
                    <td className="num">
                      <span className="td-strong">{money.format(row.accountBalance)}</span>
                    </td>
                    <td className="num">{money.format(row.expense)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {displayRows.length > 0 ? (
              <tfoot>
                <tr>
                  <th>รวมทั้งหมด</th>
                  <th className="num">
                    <div className="td-stack divided-stack">
                      <span className="td-strong td-orange">{money.format(totals.feeProfit)}</span>
                      <span className="td-muted td-info">{money.format(totals.feeCost)}</span>
                    </div>
                  </th>
                  <th className="num">
                    <div className="td-stack divided-stack">
                      <span className="td-strong td-good">{money.format(totals.boDeposit)}</span>
                      <span className="td-muted td-info">{money.format(totals.bankDeposit)}</span>
                    </div>
                  </th>
                  <th className="num">
                    <div className="td-stack divided-stack">
                      <span className="td-strong td-bad">{money.format(totals.boWithdraw)}</span>
                      <span className="td-muted td-purple">{money.format(totals.bankWithdraw)}</span>
                    </div>
                  </th>
                  <th className="num">{money.format(totals.moveTotal)}</th>
                  <th className="num summary-total-empty">—</th>
                  <th className="num">
                    <div className="td-stack divided-stack">
                      <span className="td-strong td-bad">-{money.format(totals.capitalIn)}</span>
                      <span className="td-muted td-info">-{money.format(totals.capitalReturn)}</span>
                      <span className="td-muted td-good">สุทธิ {money.format(totals.capitalIn - totals.capitalReturn)}</span>
                    </div>
                  </th>
                  <th className="num summary-total-empty">—</th>
                  <th className="num">{money.format(totals.expense)}</th>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>

      <section className="panel is-stack summary-panel">
        <div className="panel-header">
          <div>
            <h2><Coins size={16} /> ตารางสรุปคริปโตรายวัน</h2>
            <p>ซื้อ ถอน โอน USDT และยอดคงเหลือสะสมแต่ละวัน</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="summary-crypto-table">
            <thead>
              <tr>
                <th>วันที่</th>
                <th className="num">ซื้อ USDT</th>
                <th className="num">ถอน USDT</th>
                <th className="num">โอน USDT</th>
                <th className="num">คงเหลือ USDT</th>
              </tr>
            </thead>
            <tbody>
              {displayCryptoRows.length === 0 ? (
                <tr><td colSpan={5}><div className="empty-state">ยังไม่มีข้อมูลในเดือนนี้</div></td></tr>
              ) : (
                displayCryptoRows.map((row) => (
                  <tr key={row.date}>
                    <td>{ddmmyyyy(row.date)}</td>
                    <td className="num">
                      <div className="td-stack">
                        <span className="td-strong td-good">{usdt.format(row.buyUsdt)}</span>
                        <span className="td-muted">{money.format(row.buyThb)} บาท</span>
                      </div>
                    </td>
                    <td className="num">
                      <div className="td-stack">
                        <span className="td-strong td-bad">{usdt.format(row.withdrawUsdt)}</span>
                        <span className="td-muted">{money.format(row.withdrawThb)} บาท</span>
                      </div>
                    </td>
                    <td className="num">
                      <div className="td-stack">
                        <span className="td-strong td-info">{usdt.format(row.transferUsdt)}</span>
                        <span className="td-muted">{money.format(row.transferThb)} บาท</span>
                      </div>
                    </td>
                    <td className="num">
                      <div className="td-stack">
                        <span className="td-strong td-purple">{usdt.format(row.cumulativeUsdt)}</span>
                        <span className="td-muted">{money.format(row.cumulativeThb)} บาท</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {displayCryptoRows.length > 0 ? (
              <tfoot>
                <tr>
                  <th>รวมทั้งหมด</th>
                  <th className="num">
                    <div className="td-stack">
                      <span className="td-strong td-good">{usdt.format(visibleCryptoTotals.buyUsdt)}</span>
                      <span className="td-muted">{money.format(visibleCryptoTotals.buyThb)} บาท</span>
                    </div>
                  </th>
                  <th className="num">
                    <div className="td-stack">
                      <span className="td-strong td-bad">{usdt.format(visibleCryptoTotals.withdrawUsdt)}</span>
                      <span className="td-muted">{money.format(visibleCryptoTotals.withdrawThb)} บาท</span>
                    </div>
                  </th>
                  <th className="num">
                    <div className="td-stack">
                      <span className="td-strong td-info">{usdt.format(visibleCryptoTotals.transferUsdt)}</span>
                      <span className="td-muted">{money.format(visibleCryptoTotals.transferThb)} บาท</span>
                    </div>
                  </th>
                  <th className="num">
                    <div className="td-stack">
                      <span className="td-strong td-purple">{usdt.format(visibleCryptoTotals.endingUsdt)}</span>
                      <span className="td-muted">{money.format(visibleCryptoTotals.endingThb)} บาท</span>
                    </div>
                  </th>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>
    </AdminShell>
  );
}

function formatMonth(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const [year, monthNo] = month.split("-");
  const names = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];
  return `${names[Number(monthNo) - 1] || monthNo} ${year}`;
}
