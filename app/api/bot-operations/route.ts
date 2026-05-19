import { addDays, bangkokDate, monthRange } from "@/lib/dates";
import { jsonError, jsonOk } from "@/lib/http";
import { runLoggedBotJob, syncBogo2payReports, syncCompletedSettlements, syncSafeWalletApprovedDeposits, syncTickets, syncWalletSnapshot } from "@/lib/go2pay";
import { cleanupBotLogs } from "@/lib/maintenance";
import { syncStatementDaily } from "@/lib/statement";

type SyncScope = {
  mode: "today" | "date" | "month";
  label: string;
  start: string;
  end: string;
  snapshotDate: string;
};

function ok(action: string, result: Record<string, unknown>) {
  return jsonOk({ success: true, action, ...result });
}

function normalizeDate(value: unknown, fallback: string) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback;
}

function normalizeMonth(value: unknown, fallback: string) {
  const text = String(value || "");
  return /^\d{4}-\d{2}$/.test(text) ? text : fallback;
}

function minDate(a: string, b: string) {
  return a <= b ? a : b;
}

function syncScope(body: Record<string, unknown>): SyncScope {
  const today = bangkokDate();
  const mode = body.mode === "date" || body.mode === "month" ? body.mode : "today";
  if (mode === "date") {
    const date = minDate(normalizeDate(body.date, today), today);
    return { mode, label: date, start: date, end: date, snapshotDate: date };
  }
  if (mode === "month") {
    const month = normalizeMonth(body.month, today.slice(0, 7));
    const { start, end } = monthRange(month);
    const monthEnd = minDate(addDays(end, -1), today);
    return { mode, label: month, start, end: monthEnd, snapshotDate: monthEnd };
  }
  return { mode, label: today, start: today, end: today, snapshotDate: today };
}

export async function POST(request: Request) {
  let action = "unknown";
  try {
    const body = await request.json();
    action = String(body.action || "");
    const scope = syncScope(body);

    if (action === "tickets") return ok(action, await runLoggedBotJob(`Manual tickets ${scope.label}`, () => syncTickets()));
    if (action === "safewallet") {
      return ok(action, {
        ...(await runLoggedBotJob(`Manual safewallet ${scope.label}`, () => syncSafeWalletApprovedDeposits(scope.start, scope.end))),
        scope,
        duplicateChecked: true
      });
    }
    if (action === "settlements") {
      return ok(action, {
        ...(await runLoggedBotJob(`Manual settlements ${scope.label}`, () => syncCompletedSettlements(scope.start, scope.end))),
        scope,
        duplicateChecked: true
      });
    }
    if (action === "bogo2pay") {
      return ok(action, {
        ...(await runLoggedBotJob(`Manual bogo2pay ${scope.label}`, () => syncBogo2payReports(scope.start, scope.end))),
        scope,
        duplicateChecked: true
      });
    }
    if (action === "statement_daily") {
      const result = await runLoggedBotJob(`Manual statement_daily ${scope.label}`, async () => {
        const rows = scope.mode === "month"
          ? await syncStatementDaily({ month: scope.label })
          : await syncStatementDaily({ day: scope.start });
        return {
          inserted: 0,
          updated: rows.length,
          scanned: rows.length,
          skipped: 0,
          rows: rows.length
        };
      });
      return ok(action, { ...result, scope, duplicateChecked: true });
    }
    if (action === "cleanup_bot_logs") {
      return ok(action, await runLoggedBotJob("Manual cleanup bot_logs", cleanupBotLogs));
    }
    if (action === "wallet_snapshot") {
      return ok(action, {
        ...(await runLoggedBotJob(`Manual wallet_snapshot ${scope.snapshotDate}`, () => syncWalletSnapshot(scope.snapshotDate))),
        scope: { ...scope, note: "snapshot เป็นยอดปัจจุบันและบันทึกลงวันที่ที่เลือก" },
        duplicateChecked: true
      });
    }
    if (action === "sync_all") {
      const jobs = [
        await runLoggedBotJob(`Manual tickets ${scope.label}`, () => syncTickets()),
        await runLoggedBotJob(`Manual safewallet ${scope.label}`, () => syncSafeWalletApprovedDeposits(scope.start, scope.end)),
        await runLoggedBotJob(`Manual settlements ${scope.label}`, () => syncCompletedSettlements(scope.start, scope.end)),
        await runLoggedBotJob(`Manual bogo2pay ${scope.label}`, () => syncBogo2payReports(scope.start, scope.end)),
        await runLoggedBotJob(`Manual statement_daily ${scope.label}`, async () => {
          const rows = scope.mode === "month"
            ? await syncStatementDaily({ month: scope.label })
            : await syncStatementDaily({ day: scope.start });
          return { inserted: 0, updated: rows.length, scanned: rows.length, skipped: 0, rows: rows.length };
        }),
        await runLoggedBotJob(`Manual wallet_snapshot ${scope.snapshotDate}`, () => syncWalletSnapshot(scope.snapshotDate))
      ];
      return ok(action, {
        jobs: jobs.length,
        inserted: jobs.reduce((sum, job) => sum + Number(job.inserted || 0), 0),
        updated: jobs.reduce((sum, job) => sum + Number(job.updated || 0), 0),
        scanned: jobs.reduce((sum, job) => sum + Number(job.scanned || 0), 0),
        scope,
        duplicateChecked: true,
        results: jobs
      });
    }

    return jsonError("Unsupported bot operation");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Bot operation failed", 500);
  }
}
