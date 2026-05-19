import { getSupabaseAdmin } from "@/lib/supabase";

type CleanupResult = {
  successDeleted: number;
  failedDeleted: number;
  scanned: number;
  skipped: number;
};

function cutoffIso(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

async function selectBotLogIds(statusMode: "success" | "not_success", olderThanIso: string): Promise<string[]> {
  let query = getSupabaseAdmin()
    .from("bot_logs")
    .select("id")
    .lt("created_at", olderThanIso);

  query = statusMode === "success" ? query.eq("status", "success") : query.neq("status", "success");

  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query.range(from, from + 999);
    if (error) throw new Error(`bot_logs cleanup lookup failed: ${error.message}`);
    const page = (data || []) as { id?: string }[];
    ids.push(...page.map((row) => row.id).filter(Boolean) as string[]);
    if (page.length < 1000) break;
  }
  return ids;
}

async function deleteBotLogIds(ids: string[]) {
  let deleted = 0;
  for (let index = 0; index < ids.length; index += 500) {
    const chunk = ids.slice(index, index + 500);
    const { error } = await getSupabaseAdmin().from("bot_logs").delete().in("id", chunk);
    if (error) throw new Error(`bot_logs cleanup delete failed: ${error.message}`);
    deleted += chunk.length;
  }
  return deleted;
}

export async function cleanupBotLogs(): Promise<CleanupResult> {
  const successIds = await selectBotLogIds("success", cutoffIso(7));
  const failedIds = await selectBotLogIds("not_success", cutoffIso(30));
  const successDeleted = await deleteBotLogIds(successIds);
  const failedDeleted = await deleteBotLogIds(failedIds);
  return {
    successDeleted,
    failedDeleted,
    scanned: successIds.length + failedIds.length,
    skipped: 0
  };
}
