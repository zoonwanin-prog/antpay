import type { NextRequest } from "next/server";
import { addDays, bangkokDate } from "@/lib/dates";
import { runLoggedBotJob, syncCompletedSettlements } from "@/lib/go2pay";
import { assertCronAuthorized, jsonError, jsonOk } from "@/lib/http";

export async function GET(request: NextRequest) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;
  try {
    const today = bangkokDate();
    const yesterday = addDays(today, -1);
    return jsonOk({ success: true, ...(await runLoggedBotJob("Cron settlements", () => syncCompletedSettlements(yesterday, today))) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Cron settlements failed", 500);
  }
}
