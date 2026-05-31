import { createResumableUploadSession } from "@/lib/google-drive";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";

function uploadType(value: unknown) {
  const type = String(value || "statement").trim();
  if (type === "payout" || type === "bulk" || type === "payout_time" || type === "bulk_payout") return "payout_time";
  return "statement";
}

function cleanFileName(fileName: string) {
  return fileName.replace(/[^\w.\-ก-๙ ]+/g, "_").replace(/\s+/g, " ").trim() || "upload";
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const fileName = cleanFileName(String(body.file_name || ""));
    const fileSize = Number(body.file_size || 0);
    const mimeType = String(body.mime_type || "application/octet-stream");
    if (!fileName) return jsonError("กรุณาเลือกไฟล์");
    if (!Number.isFinite(fileSize) || fileSize <= 0) return jsonError("ไฟล์ว่าง กรุณาเลือกไฟล์ใหม่");

    const type = uploadType(body.type);
    const session = await createResumableUploadSession({
      fileName,
      fileSize,
      mimeType,
      folderType: type === "statement" ? "statement" : "payout_time"
    });
    return jsonOk({ success: true, ...session });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Create upload session failed", 500);
  }
}
