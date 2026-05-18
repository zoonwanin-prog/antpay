import type { NextRequest } from "next/server";
import { bangkokDate } from "@/lib/dates";
import { runLoggedBotJob, syncWalletSnapshot } from "@/lib/go2pay";
import { assertCronAuthorized, jsonError, jsonOk } from "@/lib/http";

export async function GET(request: NextRequest) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;
  try {
    return jsonOk({ success: true, ...(await runLoggedBotJob("Cron wallet_snapshot", () => syncWalletSnapshot(bangkokDate()))) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Cron wallet snapshot failed", 500);
  }
}
