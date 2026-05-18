import { getDashboardSummary } from "@/lib/dashboard";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const date = new URL(request.url).searchParams.get("date") || undefined;
    return jsonOk(await getDashboardSummary(date));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Dashboard failed", 500);
  }
}
