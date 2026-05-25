import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "antpay_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

type SessionPayload = {
  username: string;
  role: string;
  exp: number;
};

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sessionSecret() {
  return process.env.AUTH_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "antpay-dev-session";
}

export function hashPassword(password: string) {
  return `sha256:${createHash("sha256").update(password).digest("hex")}`;
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function createSessionToken(username: string, role: string) {
  const payload: SessionPayload = {
    username,
    role,
    exp: Date.now() + SESSION_TTL_MS
  };
  const body = base64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}
