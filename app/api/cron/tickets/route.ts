import type { NextRequest } from "next/server";
import { runLoggedBotJob, syncTickets } from "@/lib/go2pay";
import { assertCronAuthorized, jsonError, jsonOk } from "@/lib/http";

export async function GET(request: NextRequest) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;
  try {
    return jsonOk({ success: true, ...(await runLoggedBotJob("Cron tickets", () => syncTickets())) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Cron tickets failed", 500);
  }
}
