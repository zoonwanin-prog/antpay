import { NextResponse } from "next/server";
import { exchangeCodeForTokens, persistTokenFromExchange } from "@/lib/google-drive";

export const runtime = "nodejs";

const STATE_COOKIE = "g_oauth_state";
const RETURN_COOKIE = "g_oauth_return";

function safeRedirect(origin: string, path: string, params: Record<string, string>) {
  const finalPath = path.startsWith("/") && !path.startsWith("//") ? path : "/settings/system";
  const url = new URL(finalPath, origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function clearOAuthCookies(response: NextResponse) {
  response.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(RETURN_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const returnTo = request.headers.get("cookie")?.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${RETURN_COOKIE}=`))?.split("=")[1];
  const fallbackReturn = decodeURIComponent(returnTo || "") || "/settings/system";

  const error = url.searchParams.get("error");
  if (error) {
    const target = safeRedirect(origin, fallbackReturn, { google_drive: "error", message: error });
    return clearOAuthCookies(NextResponse.redirect(target));
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieHeader = request.headers.get("cookie") || "";
  const cookieState = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))
    ?.split("=")[1];

  if (!code || !state || !cookieState || state !== cookieState) {
    const target = safeRedirect(origin, fallbackReturn, { google_drive: "error", message: "invalid_state" });
    return clearOAuthCookies(NextResponse.redirect(target));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await persistTokenFromExchange(tokens);
    const target = safeRedirect(origin, fallbackReturn, { google_drive: "connected" });
    return clearOAuthCookies(NextResponse.redirect(target));
  } catch (err) {
    const message = err instanceof Error ? err.message : "oauth_failed";
    const target = safeRedirect(origin, fallbackReturn, { google_drive: "error", message });
    return clearOAuthCookies(NextResponse.redirect(target));
  }
}
