import { downloadDriveFile, makeDriveFileReadable } from "@/lib/google-drive";
import { jsonError, jsonOk } from "@/lib/http";
import { importPayoutFile, importStatementFile } from "@/lib/statement-import";

export const runtime = "nodejs";
export const maxDuration = 300;

function uploadType(value: unknown) {
  const type = String(value || "statement").trim();
  if (type === "payout" || type === "bulk" || type === "payout_time" || type === "bulk_payout") return "payout_time";
  return "statement";
}

function driveUrl(fileId: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const type = uploadType(body.type);
    const driveFileId = String(body.drive_file_id || "");
    if (!driveFileId) return jsonError("missing Drive file id");

    const uploadedBy = String(body.uploaded_by || "admin");
    const fileName = String(body.file_name || "upload.csv");
    const webViewLink = String(body.web_view_link || driveUrl(driveFileId));
    const file = await downloadDriveFile(driveFileId);
    const csvText = file.buffer.toString("utf8");
    const driveFile = {
      drive_file_id: driveFileId,
      web_view_link: webViewLink,
      file_name: file.fileName || fileName
    };

    const importResult = type === "statement"
      ? await importStatementFile({
        csvText,
        fileName,
        uploadedBy,
        accountId: String(body.account_id || ""),
        bank: String(body.bank || ""),
        driveFile
      })
      : await importPayoutFile({
        csvText,
        fileName,
        uploadedBy,
        driveFile,
        sourceAccountId: String(body.payout_source_account_id || "")
      });

    await makeDriveFileReadable(driveFileId);
    return jsonOk({ success: true, import: importResult });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Import Drive file failed", 500);
  }
}
