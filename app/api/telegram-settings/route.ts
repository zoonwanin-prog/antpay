import { jsonError, jsonOk } from "@/lib/http";
import { sendTelegram, telegramTarget } from "@/lib/telegram";
import {
  getTelegramBotTokenStatus,
  getTelegramSettingsStatus,
  setTelegramBotToken,
  setTelegramTargetSettings,
  TELEGRAM_TARGETS,
  type TelegramTargetKey
} from "@/lib/system-settings";

export async function GET() {
  try {
    const [rows, tokenStatus] = await Promise.all([
      getTelegramSettingsStatus(),
      getTelegramBotTokenStatus()
    ]);
    return jsonOk({ success: true, rows, tokenStatus });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "โหลด Telegram settings ไม่สำเร็จ", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    if (String(body.action || "") === "save_token") {
      await setTelegramBotToken(String(body.token || ""));
      const [rows, tokenStatus] = await Promise.all([
        getTelegramSettingsStatus(),
        getTelegramBotTokenStatus()
      ]);
      return jsonOk({ success: true, rows, tokenStatus });
    }
    const target = String(body.target || "") as TelegramTargetKey;
    if (!TELEGRAM_TARGETS.includes(target)) return jsonError("ไม่รู้จักประเภท Telegram target");
    await setTelegramTargetSettings({
      target,
      chatId: String(body.chatId || ""),
      threadId: String(body.threadId || "")
    });
    const [rows, tokenStatus] = await Promise.all([
      getTelegramSettingsStatus(),
      getTelegramBotTokenStatus()
    ]);
    return jsonOk({ success: true, rows, tokenStatus });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "บันทึก Telegram settings ไม่สำเร็จ", 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const target = String(body.target || "") as TelegramTargetKey;
    if (!TELEGRAM_TARGETS.includes(target)) return jsonError("ไม่รู้จักประเภท Telegram target");
    const result = await sendTelegram(
      `ทดสอบ Telegram ${target.toUpperCase()} จาก AntpayBO`,
      await telegramTarget(target)
    );
    return jsonOk({ success: true, result });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "ทดสอบส่ง Telegram ไม่สำเร็จ", 500);
  }
}
