import { jsonError, jsonOk } from "@/lib/http";
import { clearStoredToken, describeConnectionStatus } from "@/lib/google-drive";

export const runtime = "nodejs";

export async function GET() {
  try {
    const status = await describeConnectionStatus();
    return jsonOk({ success: true, ...status });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Load status failed", 500);
  }
}

export async function DELETE() {
  try {
    await clearStoredToken();
    return jsonOk({ success: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Disconnect failed", 500);
  }
}
