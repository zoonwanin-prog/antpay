import { downloadDriveFile, extractDriveFileId } from "@/lib/google-drive";
import { listRowsByDate, listRowsThroughDate } from "@/lib/repositories";
import {
  sendTelegram,
  sendTelegramDocument,
  sendTelegramPhoto,
  telegramTarget
} from "@/lib/telegram";
import type { JsonRecord } from "@/lib/types";

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyShort = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const usdt = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
const usdtShort = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function txt(value: unknown): string {
  return String(value ?? "").trim();
}

function dateLine(row: JsonRecord) {
  const date = txt(row.date).slice(0, 10);
  const time = txt(row.time).slice(0, 5);
  if (date && time) return `${date} ${time}`;
  return date || "-";
}

function displayDate(date: string) {
  if (!date || date.length < 10) return date || "-";
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

async function formatTransferCaption(row: JsonRecord, mode: "create" | "update"): Promise<string> {
  const date = txt(row.date).slice(0, 10);
  const source = txt(row.source_account);
  let sourceTotal = Number(row.amount || 0);
  let dayTotal = Number(row.amount || 0);
  if (date) {
    const rows = await listRowsByDate<JsonRecord>("transfers", "date", date);
    sourceTotal = 0;
    dayTotal = 0;
    for (const item of rows) {
      const amount = Number(item.amount || 0);
      dayTotal += amount;
      if (txt(item.source_account) === source) sourceTotal += amount;
    }
  }

  const lines: string[] = [];
  lines.push(mode === "update" ? "<b>🚀 แก้ไขการโยกเงิน</b>" : "<b>🚀 แจ้งเตือนการโยกเงิน</b>");
  lines.push("--------------------------------");
  lines.push(`📌 ประเภท: ${escapeHtml(txt(row.status) || "-")}`);
  lines.push(`📤 จาก: ${escapeHtml(source || "-")}`);
  lines.push(`📥 ไป: ${escapeHtml(txt(row.target_account) || "-")}`);
  lines.push(`💰 ยอดโอน: ${moneyShort.format(Number(row.amount || 0))} บาท`);
  const fee = Number(row.fee || 0);
  if (fee > 0) lines.push(`ค่าธรรมเนียม: ${moneyShort.format(fee)} บาท`);
  lines.push("--------------------------------");
  lines.push(`📈 ยอดรวม [${escapeHtml(source || "-")}] วันนี้: ${moneyShort.format(sourceTotal)} บาท`);
  lines.push(`📊 ยอดรวมทุกบัญชีวันนี้: ${moneyShort.format(dayTotal)} บาท`);
  if (txt(row.note)) {
    lines.push("");
    lines.push(`หมายเหตุ: ${escapeHtml(txt(row.note))}`);
  }
  if (txt(row.user_name)) lines.push(`ผู้บันทึก: ${escapeHtml(txt(row.user_name))}`);
  return lines.join("\n");
}

type CryptoSummary = {
  buyUsdt: number;
  buyThb: number;
  withdrawUsdt: number;
  withdrawThb: number;
  transferUsdt: number;
  transferThb: number;
  balanceUsdt: number;
  balanceThb: number;
};

async function getCryptoSummary(row: JsonRecord): Promise<CryptoSummary> {
  const date = txt(row.date).slice(0, 10);
  if (!date) {
    return { buyUsdt: 0, buyThb: 0, withdrawUsdt: 0, withdrawThb: 0, transferUsdt: 0, transferThb: 0, balanceUsdt: 0, balanceThb: 0 };
  }
  const rows = await listRowsThroughDate<JsonRecord>("crypto_transactions", "date", date);
  let buyUsdt = 0;
  let buyThb = 0;
  let withdrawUsdt = 0;
  let withdrawThb = 0;
  let transferUsdt = 0;
  let transferThb = 0;
  let balanceUsdt = 0;
  let balanceThb = 0;

  for (const item of rows) {
    const itemDate = txt(item.date).slice(0, 10);
    const status = txt(item.status);
    const itemUsdt = Number(item.usdt || 0);
    const itemThb = Number(item.amount_thb || 0);
    if (itemDate === date) {
      if (status === "ซื้อ USDT") {
        buyUsdt += itemUsdt;
        buyThb += itemThb;
      } else if (status === "ถอน USDT") {
        withdrawUsdt += itemUsdt;
        withdrawThb += itemThb;
      } else if (status === "โอน USDT") {
        transferUsdt += itemUsdt;
        transferThb += itemThb;
      }
    }

    if (status === "ซื้อ USDT") {
      balanceUsdt += itemUsdt;
      balanceThb += itemThb;
    } else if (status === "ถอน USDT" || status === "โอน USDT" || status === "ขาย USDT") {
      balanceUsdt -= itemUsdt;
      balanceThb -= itemThb;
    }
  }

  return {
    buyUsdt,
    buyThb,
    withdrawUsdt,
    withdrawThb,
    transferUsdt,
    transferThb,
    balanceUsdt,
    balanceThb
  };
}

async function formatCryptoCaption(row: JsonRecord, mode: "create" | "update"): Promise<string> {
  const summary = await getCryptoSummary(row);
  const date = txt(row.date).slice(0, 10);
  const lines: string[] = [];
  lines.push(mode === "update" ? "<b>₿ แก้ไขการโยก Crypto</b>" : "<b>₿ แจ้งเตือนการโยก Crypto</b>");
  lines.push("--------------------------------");
  lines.push(`📌 ประเภท: ${escapeHtml(txt(row.status) || "-")}`);
  lines.push(`📤 จาก: ${escapeHtml(txt(row.source_account) || "-")}`);
  lines.push(`📥 ไป: ${escapeHtml(txt(row.target_account) || "-")}`);
  lines.push(`💵 จำนวน: ${money.format(Number(row.amount_thb || 0))} บาท`);
  lines.push(`💎 USDT: ${usdtShort.format(Number(row.usdt || 0))}`);
  if (Number(row.exchange_rate || 0)) lines.push(`📈 อัตรา: ${usdtShort.format(Number(row.exchange_rate || 0))}`);
  lines.push("--------------------------------");
  lines.push(`📊 สรุปวันนี้ (${displayDate(date)}):`);
  lines.push(`• ซื้อ USDT: ${usdtShort.format(summary.buyUsdt)} USDT / ${money.format(summary.buyThb)} บาท`);
  lines.push(`• ถอน USDT: ${usdtShort.format(summary.withdrawUsdt)} USDT / ${money.format(summary.withdrawThb)} บาท`);
  lines.push(`• โอน USDT: ${usdtShort.format(summary.transferUsdt)} USDT / ${money.format(summary.transferThb)} บาท`);
  lines.push(`• คงเหลือทั้งหมด: ${usdtShort.format(summary.balanceUsdt)} USDT / ${money.format(summary.balanceThb)} บาท`);
  if (txt(row.note)) lines.push(`หมายเหตุ: ${escapeHtml(txt(row.note))}`);
  if (txt(row.user_name)) lines.push(`ผู้บันทึก: ${escapeHtml(txt(row.user_name))}`);
  return lines.join("\n");
}

function isImageMime(mime: string) {
  return /^image\//i.test(mime);
}

/**
 * แจ้ง Telegram หลังบันทึกรายการ
 * - table = transfers → ไปยัง chat "transfer"
 * - table = crypto_transactions → ไปยัง chat "crypto"
 * - ถ้า row.slip_url เป็นไฟล์ใน Google Drive → ดาวน์โหลดด้วย OAuth token แล้วส่งเป็นรูป (หรือเอกสาร)
 * - ถ้าไม่มีสลิป หรือดาวน์โหลดไม่สำเร็จ → fallback เป็น sendMessage แทน
 *
 * ฟังก์ชันนี้ไม่ throw — log warn แล้วคืน object รายงานผล
 */
export async function notifyEntryCreated(
  table: string,
  row: JsonRecord | null | undefined,
  options: { mode?: "create" | "update" } = {}
): Promise<{ sent?: string; skipped?: boolean; warn?: string; reason?: string }> {
  if (!row) return { skipped: true, reason: "no_row" };
  const mode = options.mode || "create";
  let kind: "transfer" | "crypto" | null = null;
  let caption = "";
  if (table === "transfers") {
    kind = "transfer";
    caption = await formatTransferCaption(row, mode);
  } else if (table === "crypto_transactions") {
    kind = "crypto";
    caption = await formatCryptoCaption(row, mode);
  } else {
    return { skipped: true, reason: "unsupported_table" };
  }

  let target;
  try {
    target = await telegramTarget(kind);
  } catch (err) {
    return { skipped: true, warn: err instanceof Error ? err.message : String(err) };
  }
  if (!target?.chatId) return { skipped: true, reason: "no_target" };

  const slipUrl = txt(row.slip_url);
  const driveFileId = slipUrl ? extractDriveFileId(slipUrl) : null;

  if (driveFileId) {
    try {
      const file = await downloadDriveFile(driveFileId);
      if (isImageMime(file.mimeType)) {
        await sendTelegramPhoto({
          buffer: file.buffer,
          mimeType: file.mimeType,
          fileName: file.fileName,
          caption,
          target
        });
        return { sent: "photo" };
      }
      await sendTelegramDocument({
        buffer: file.buffer,
        mimeType: file.mimeType,
        fileName: file.fileName,
        caption,
        target
      });
      return { sent: "document" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[notifyEntryCreated] Drive download failed, falling back to text: ${message}`);
      try {
        await sendTelegram(caption, target);
        return { sent: "text", warn: message };
      } catch (err2) {
        return {
          skipped: true,
          warn: `text fallback failed: ${err2 instanceof Error ? err2.message : String(err2)}`
        };
      }
    }
  }

  try {
    await sendTelegram(caption, target);
    return { sent: "text" };
  } catch (err) {
    return { skipped: true, warn: err instanceof Error ? err.message : String(err) };
  }
}
