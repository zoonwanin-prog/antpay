import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { buildOAuthStartUrl, describeMissingEnv } from "@/lib/google-drive";

export const runtime = "nodejs";

const STATE_COOKIE = "g_oauth_state";
const RETURN_COOKIE = "g_oauth_return";

function sanitizeReturnPath(value: string | null): string {
  if (!value) return "/settings/system";
  // Allow same-origin paths only.
  if (!value.startsWith("/") || value.startsWith("//")) return "/settings/system";
  return value;
}

export async function GET(request: Request) {
  const missing = describeMissingEnv();
  if (missing.length > 0) {
    return NextResponse.json(
      { success: false, message: `Missing env: ${missing.join(", ")}` },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const returnTo = sanitizeReturnPath(url.searchParams.get("return"));
  const state = crypto.randomBytes(16).toString("hex");
  const target = buildOAuthStartUrl(state);

  const response = NextResponse.redirect(target);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600
  });
  response.cookies.set(RETURN_COOKIE, returnTo, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600
  });
  return response;
}
