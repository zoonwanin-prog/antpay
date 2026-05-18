import { optionalEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createHash } from "node:crypto";

const GO2PAY_TOKEN_KEY = "go2pay_admin_token";
const DRIVE_ACCESS_PASSWORD_KEY = "statement_drive_access_password_hash";
const TELEGRAM_BOT_TOKEN_KEY = "telegram_bot_token";
export const TELEGRAM_TARGETS = ["transfer", "crypto", "ticket", "alert"] as const;
export type TelegramTargetKey = typeof TELEGRAM_TARGETS[number];

const TELEGRAM_ENV_PREFIX: Record<TelegramTargetKey, string> = {
  transfer: "TELEGRAM_TRANSFER",
  crypto: "TELEGRAM_CRYPTO",
  ticket: "TELEGRAM_TICKET",
  alert: "TELEGRAM_TOKEN_ALERT"
};

function telegramSettingKey(target: TelegramTargetKey, field: "chat_id" | "thread_id") {
  return `telegram_${target}_${field}`;
}

export function maskSecret(value: string) {
  if (!value) return "ยังไม่ได้ตั้งค่า";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export async function getSystemSetting(key: string): Promise<string> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("app_system_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) {
      if (/schema cache|does not exist|Could not find/i.test(error.message)) return "";
      throw error;
    }
    return String(data?.value || "");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/schema cache|does not exist|Could not find/i.test(message)) return "";
    throw error;
  }
}

export async function setSystemSetting(key: string, value: string) {
  const { error } = await getSupabaseAdmin().from("app_system_settings").upsert({
    key,
    value,
    updated_at: new Date().toISOString()
  });
  if (error) throw new Error(error.message);
}

function hashPassword(password: string) {
  return `sha256:${createHash("sha256").update(password).digest("hex")}`;
}

export async function getGo2PayAdminToken() {
  return (await getSystemSetting(GO2PAY_TOKEN_KEY)) || optionalEnv("GO2PAY_ADMIN_TOKEN");
}

export async function setGo2PayAdminToken(token: string) {
  await setSystemSetting(GO2PAY_TOKEN_KEY, token);
}

export async function getGo2PayTokenStatus() {
  const overrideToken = await getSystemSetting(GO2PAY_TOKEN_KEY);
  const envToken = optionalEnv("GO2PAY_ADMIN_TOKEN");
  const token = overrideToken || envToken;
  return {
    hasToken: Boolean(token),
    source: overrideToken ? "Supabase override" : envToken ? "Environment" : "ยังไม่ได้ตั้งค่า",
    masked: maskSecret(token)
  };
}

export async function setStatementDriveAccessPassword(password: string) {
  const cleanPassword = password.trim();
  if (!cleanPassword) throw new Error("กรุณากรอกรหัสผ่าน");
  await setSystemSetting(DRIVE_ACCESS_PASSWORD_KEY, hashPassword(cleanPassword));
}

export async function verifyStatementDriveAccessPassword(password: string) {
  const savedHash = await getSystemSetting(DRIVE_ACCESS_PASSWORD_KEY);
  if (!savedHash) return true;
  return savedHash === hashPassword(password.trim());
}

export async function getStatementDriveAccessPasswordStatus() {
  const savedHash = await getSystemSetting(DRIVE_ACCESS_PASSWORD_KEY);
  return {
    enabled: Boolean(savedHash),
    masked: savedHash ? "********" : "ยังไม่ได้ตั้งค่า"
  };
}

export async function getTelegramTargetSetting(target: TelegramTargetKey) {
  const prefix = TELEGRAM_ENV_PREFIX[target];
  const chatOverride = await getSystemSetting(telegramSettingKey(target, "chat_id"));
  const threadOverride = await getSystemSetting(telegramSettingKey(target, "thread_id"));
  const envChat = optionalEnv(`${prefix}_CHAT_ID`);
  const envThread = optionalEnv(`${prefix}_THREAD_ID`);
  return {
    target,
    chatId: chatOverride || envChat || "",
    threadId: threadOverride || envThread || "",
    chatSource: chatOverride ? "Supabase" : envChat ? "Environment" : "ยังไม่ได้ตั้งค่า",
    threadSource: threadOverride ? "Supabase" : envThread ? "Environment" : "ยังไม่ได้ตั้งค่า"
  };
}

export async function getTelegramSettingsStatus() {
  return Promise.all(TELEGRAM_TARGETS.map((target) => getTelegramTargetSetting(target)));
}

export async function setTelegramTargetSettings(input: {
  target: TelegramTargetKey;
  chatId: string;
  threadId: string;
}) {
  if (!TELEGRAM_TARGETS.includes(input.target)) throw new Error("ไม่รู้จักประเภท Telegram target");
  await Promise.all([
    setSystemSetting(telegramSettingKey(input.target, "chat_id"), input.chatId.trim()),
    setSystemSetting(telegramSettingKey(input.target, "thread_id"), input.threadId.trim())
  ]);
}

export async function getTelegramBotToken() {
  return (await getSystemSetting(TELEGRAM_BOT_TOKEN_KEY)) || optionalEnv("TELEGRAM_BOT_TOKEN");
}

export async function setTelegramBotToken(token: string) {
  const cleanToken = token.trim();
  if (!cleanToken) throw new Error("กรุณากรอก Telegram bot token");
  await setSystemSetting(TELEGRAM_BOT_TOKEN_KEY, cleanToken);
}

export async function getTelegramBotTokenStatus() {
  const overrideToken = await getSystemSetting(TELEGRAM_BOT_TOKEN_KEY);
  const envToken = optionalEnv("TELEGRAM_BOT_TOKEN");
  const token = overrideToken || envToken;
  return {
    hasToken: Boolean(token),
    source: overrideToken ? "Supabase" : envToken ? "Environment" : "ยังไม่ได้ตั้งค่า",
    masked: maskSecret(token)
  };
}
