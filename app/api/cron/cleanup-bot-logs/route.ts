import type { NextRequest } from "next/server";
import { runLoggedBotJob } from "@/lib/go2pay";
import { cleanupBotLogs } from "@/lib/maintenance";
import { assertCronAuthorized, jsonError, jsonOk } from "@/lib/http";

export async function GET(request: NextRequest) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;
  try {
    return jsonOk({ success: true, ...(await runLoggedBotJob("Cron cleanup bot_logs", cleanupBotLogs)) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Cleanup bot logs failed", 500);
  }
}
