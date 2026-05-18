import { optionalEnv } from "@/lib/env";
import { getTelegramBotToken, getTelegramTargetSetting } from "@/lib/system-settings";
import type { TelegramTarget } from "@/lib/types";

export async function telegramTarget(kind: "transfer" | "crypto" | "ticket" | "tokenAlert" | "alert"): Promise<TelegramTarget | null> {
  const targetKey = kind === "tokenAlert" ? "alert" : kind;
  const override = await getTelegramTargetSetting(targetKey);
  if (override.chatId) {
    return {
      chatId: override.chatId,
      threadId: override.threadId || undefined
    };
  }

  const prefix = {
    transfer: "TELEGRAM_TRANSFER",
    crypto: "TELEGRAM_CRYPTO",
    ticket: "TELEGRAM_TICKET",
    tokenAlert: "TELEGRAM_TOKEN_ALERT",
    alert: "TELEGRAM_TOKEN_ALERT"
  }[kind];
  const chatId = optionalEnv(`${prefix}_CHAT_ID`);
  if (!chatId) return null;
  return {
    chatId,
    threadId: optionalEnv(`${prefix}_THREAD_ID`) || undefined
  };
}

export async function sendTelegram(message: string, target: TelegramTarget | null) {
  const token = (await getTelegramBotToken()) || optionalEnv("TELEGRAM_BOT_TOKEN");
  if (!token || !target?.chatId) return { skipped: true };
  const body: Record<string, string> = {
    chat_id: target.chatId,
    text: message,
    parse_mode: "HTML",
    disable_web_page_preview: "true"
  };
  if (target.threadId) body.message_thread_id = target.threadId;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Telegram HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * ส่งรูปไป Telegram โดยใช้ multipart/form-data (sendPhoto)
 * - buffer + mimeType + fileName: ข้อมูลไฟล์
 * - caption: ข้อความบรรยาย รองรับ HTML
 * - target: chat_id + (optional) thread_id
 */
export async function sendTelegramPhoto(args: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  caption?: string;
  target: TelegramTarget | null;
}): Promise<unknown> {
  const token = (await getTelegramBotToken()) || optionalEnv("TELEGRAM_BOT_TOKEN");
  if (!token || !args.target?.chatId) return { skipped: true };
  const form = new FormData();
  form.set("chat_id", args.target.chatId);
  if (args.target.threadId) form.set("message_thread_id", args.target.threadId);
  if (args.caption) {
    form.set("caption", args.caption);
    form.set("parse_mode", "HTML");
  }
  const blob = new Blob([new Uint8Array(args.buffer)], { type: args.mimeType || "image/jpeg" });
  form.set("photo", blob, args.fileName || "slip.jpg");

  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    body: form
  });
  if (!res.ok) throw new Error(`Telegram sendPhoto HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * ส่งไฟล์อะไรก็ได้ (เผื่อ slip เป็น PDF) ด้วย sendDocument
 */
export async function sendTelegramDocument(args: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  caption?: string;
  target: TelegramTarget | null;
}): Promise<unknown> {
  const token = (await getTelegramBotToken()) || optionalEnv("TELEGRAM_BOT_TOKEN");
  if (!token || !args.target?.chatId) return { skipped: true };
  const form = new FormData();
  form.set("chat_id", args.target.chatId);
  if (args.target.threadId) form.set("message_thread_id", args.target.threadId);
  if (args.caption) {
    form.set("caption", args.caption);
    form.set("parse_mode", "HTML");
  }
  const blob = new Blob([new Uint8Array(args.buffer)], { type: args.mimeType || "application/octet-stream" });
  form.set("document", blob, args.fileName || "slip.bin");

  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: "POST",
    body: form
  });
  if (!res.ok) throw new Error(`Telegram sendDocument HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}
