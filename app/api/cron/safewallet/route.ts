import type { NextRequest } from "next/server";
import { addDays, bangkokDate } from "@/lib/dates";
import { runLoggedBotJob, syncSafeWalletApprovedDeposits } from "@/lib/go2pay";
import { assertCronAuthorized, jsonError, jsonOk } from "@/lib/http";

export async function GET(request: NextRequest) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;
  try {
    const today = bangkokDate();
    const start = addDays(today, -30);
    return jsonOk({ success: true, ...(await runLoggedBotJob("Cron safewallet", () => syncSafeWalletApprovedDeposits(start, today))) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Cron safewallet failed", 500);
  }
}
