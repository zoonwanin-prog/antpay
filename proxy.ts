import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "antpay_session";

function secret() {
  return process.env.AUTH_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "antpay-dev-session";
}

function base64Url(bytes: ArrayBuffer) {
  const chars = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(chars).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function validSession(token: string) {
  const [body, signature] = token.split(".");
  if (!body || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  if (base64Url(signed) !== signature) return false;
  try {
    const normalized = body.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    return Number(payload.exp || 0) > Date.now();
  } catch {
    return false;
  }
}

function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/google/oauth/callback" ||
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico"
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value || "";
  if (token && (await validSession(token))) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("return", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"]
};
