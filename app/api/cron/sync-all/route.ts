import type { NextRequest } from "next/server";
import { addDays, bangkokDate } from "@/lib/dates";
import { assertCronAuthorized, jsonError, jsonOk } from "@/lib/http";
import {
  runLoggedBotJob,
  syncBogo2payReports,
  syncCompletedSettlements,
  syncSafeWalletApprovedDeposits,
  syncTickets,
  syncWalletSnapshot
} from "@/lib/go2pay";
import { syncStatementDaily } from "@/lib/statement";

export async function GET(request: NextRequest) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;
  try {
    const today = bangkokDate();
    const yesterday = addDays(today, -1);
    const jobs = [
      await runLoggedBotJob("Cron sync_all tickets", () => syncTickets()),
      await runLoggedBotJob("Cron sync_all bogo2pay", () => syncBogo2payReports(yesterday, today)),
      await runLoggedBotJob("Cron sync_all safewallet", () => syncSafeWalletApprovedDeposits(addDays(today, -30), today)),
      await runLoggedBotJob("Cron sync_all settlements", () => syncCompletedSettlements(yesterday, today)),
      await runLoggedBotJob("Cron sync_all wallet_snapshot", () => syncWalletSnapshot(today)),
      await runLoggedBotJob("Cron sync_all statements", async () => {
        const rows = [
          ...(await syncStatementDaily({ day: yesterday })),
          ...(await syncStatementDaily({ day: today }))
        ];
        return { inserted: 0, updated: rows.length, scanned: rows.length, rows: rows.length, days: [yesterday, today] };
      })
    ];
    return jsonOk({
      success: true,
      jobs: jobs.length,
      inserted: jobs.reduce((sum, job) => sum + Number(job.inserted || 0), 0),
      updated: jobs.reduce((sum, job) => sum + Number(job.updated || 0), 0),
      scanned: jobs.reduce((sum, job) => sum + Number(job.scanned || 0), 0),
      results: jobs
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Cron sync all failed", 500);
  }
}
