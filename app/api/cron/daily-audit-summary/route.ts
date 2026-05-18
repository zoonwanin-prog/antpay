import type { NextRequest } from "next/server";
import { addDays, bangkokDate } from "@/lib/dates";
import { sendAuditTelegram } from "@/lib/audit-telegram";
import { assertCronAuthorized, jsonError, jsonOk } from "@/lib/http";

export async function GET(request: NextRequest) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;
  try {
    const date = addDays(bangkokDate(), -1);
    await sendAuditTelegram(date);
    return jsonOk({ success: true, date });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Daily audit summary failed", 500);
  }
}
