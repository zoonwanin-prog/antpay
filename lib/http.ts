import { NextResponse, type NextRequest } from "next/server";

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status = 400): NextResponse<{ success: false; message: string }> {
  return NextResponse.json({ success: false, message }, { status });
}

export function assertCronAuthorized(request: NextRequest): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  const auth = request.headers.get("authorization") || "";
  if (auth === `Bearer ${secret}`) return null;
  return jsonError("Unauthorized cron request", 401);
}
