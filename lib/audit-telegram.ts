import { getAuditData } from "@/lib/audit";
import { getMonthlySummary } from "@/lib/summary";
import { sendTelegram, telegramTarget } from "@/lib/telegram";

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdt = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ddmmyyyy(date: string) {
  if (!date || date.length < 10) return date || "-";
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

function signedMoney(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${money.format(value)}`;
}

export async function buildAuditTelegramMessage(date: string): Promise<string> {
  const month = date.slice(0, 7);
  const [audit, summary] = await Promise.all([
    getAuditData(month),
    getMonthlySummary(month)
  ]);
  const row = audit.rows.find((item) => item.date === date);
  if (!row) throw new Error(`ไม่พบข้อมูล Audit วันที่ ${date}`);
  const summaryRow = summary.rows.find((item) => item.date === date);
  const cryptoRow = summary.cryptoRows.find((item) => item.date === date);

  const feeProfit = summaryRow?.feeProfit || 0;
  const coinFee = summaryRow?.feeCost || 0;
  const totalProfit = feeProfit + coinFee;
  const totalReference = row.transferOnly + row.settlement + row.errorFollowTransfer + row.otherTransfer + row.buyUSDTthb;
  const finalDiffWithdraw = row.diffWithdraw - row.failedWithdrawPaid - row.sheetExpense - row.statementFee - totalReference;

  return [
    "📊 สรุปรายวัน + Audit",
    `วันที่ ${ddmmyyyy(date)}`,
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "💰 ผลประกอบการ",
    `กำไรค่าธรรมเนียม: ${money.format(feeProfit)} บาท`,
    `ค่าธรรมเนียมขึ้นเหรียญ: ${money.format(coinFee)} บาท`,
    `รวม: ${money.format(totalProfit)} บาท`,
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "🏦 ปิดยอดธนาคาร",
    `เงินตั้งต้น: ${money.format(row.openingBalance)}`,
    `+ ฝากธนาคาร: ${money.format(row.bankDeposit)}`,
    `- ถอนธนาคาร: ${money.format(row.bankWithdraw)}`,
    `= เงินควรเหลือ: ${money.format(row.expectedBalance)}`,
    `เงินในบัญชีจริง: ${money.format(row.actualBalance)}`,
    `Diff ธนาคาร: ${signedMoney(row.diffBank)}`,
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "📥 ฝาก",
    `ฝาก BO: ${money.format(row.boDeposit)}`,
    `ฝากธนาคาร: ${money.format(row.bankDeposit)}`,
    `Diff ฝาก: ${signedMoney(row.diffDeposit)}`,
    "",
    "📤 ถอน",
    `ถอน BO ที่ต้องโอนทั้งหมด: ${money.format(row.boWithdraw)}`,
    `ถอนธนาคาร: ${money.format(row.bankWithdraw)}`,
    `Diff ถอน: ${signedMoney(row.diffWithdraw)}`,
    "",
    "หายอด Diff ถอนหลังหักรายการที่อธิบายได้",
    `Diff ถอน: ${money.format(row.diffWithdraw)}`,
    `- ถอนไม่สำเร็จที่โอนแล้ว: ${money.format(row.failedWithdrawPaid)}`,
    `- รายจ่ายจากชีท: ${money.format(row.sheetExpense)}`,
    `- Fee ค่าธรรมเนียม: ${money.format(row.statementFee)}`,
    `- ยอดอ้างอิงทั้งหมด: ${money.format(totalReference)}`,
    "🔴 สรุป Diff ถอนหลังหักยอดอธิบาย",
    money.format(finalDiffWithdraw),
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "🔄 ยอดอ้างอิง",
    `โยกเงิน: ${money.format(row.transferOnly)}`,
    `โอน Settlement: ${money.format(row.settlement)}`,
    `โอนตามยอด error: ${money.format(row.errorFollowTransfer)}`,
    `อื่นๆ: ${money.format(row.otherTransfer)}`,
    `รายจ่ายจากชีท: ${money.format(row.sheetExpense)}`,
    `Fee ค่าธรรมเนียม: ${money.format(row.statementFee)}`,
    "",
    "₿ คริปโต",
    `ซื้อ USDT: ${usdt.format(cryptoRow?.buyUsdt || 0)} USDT / ${money.format(cryptoRow?.buyThb || 0)} บาท`,
    `ถอน USDT: ${usdt.format(cryptoRow?.withdrawUsdt || 0)} USDT / ${money.format(cryptoRow?.withdrawThb || 0)} บาท`,
    `โอน USDT: ${usdt.format(cryptoRow?.transferUsdt || 0)} USDT / ${money.format(cryptoRow?.transferThb || 0)} บาท`,
    `คงเหลือสะสมทั้งหมด: ${usdt.format(cryptoRow?.cumulativeUsdt || 0)} USDT / ${money.format(cryptoRow?.cumulativeThb || 0)} บาท`,
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "⚠️ รายการถอนไม่สำเร็จ",
    `ทั้งหมด: ${row.failedWithdrawCount} รายการ / ${money.format(row.failedWithdraw)} บาท`,
    `โอนแล้ว: ${row.failedWithdrawPaidCount} รายการ / ${money.format(row.failedWithdrawPaid)} บาท`,
    `ค้างโอน: ${row.failedWithdrawPendingCount} รายการ / ${money.format(row.failedWithdrawPending)} บาท`,
    "━━━━━━━━━━━━━━━━━━━━"
  ].join("\n");
}

export async function sendAuditTelegram(date: string) {
  const message = await buildAuditTelegramMessage(date);
  const result = await sendTelegram(message, await telegramTarget("transfer"));
  return { message, result };
}
