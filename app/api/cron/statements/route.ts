import type { NextRequest } from "next/server";
import { addDays, bangkokDate } from "@/lib/dates";
import { runLoggedBotJob } from "@/lib/go2pay";
import { assertCronAuthorized, jsonError, jsonOk } from "@/lib/http";
import { syncStatementDaily } from "@/lib/statement";

export async function GET(request: NextRequest) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;
  try {
    const today = bangkokDate();
    const yesterday = addDays(today, -1);
    const result = await runLoggedBotJob("Cron statements", async () => {
      const rows = [
        ...(await syncStatementDaily({ day: yesterday })),
        ...(await syncStatementDaily({ day: today }))
      ];
      return { inserted: 0, updated: rows.length, scanned: rows.length, rows: rows.length, days: [yesterday, today] };
    });
    return jsonOk({ success: true, ...result });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Cron statements failed", 500);
  }
}
