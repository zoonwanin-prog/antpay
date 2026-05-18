import { getSupabaseAdmin } from "@/lib/supabase";
import { recordDriveUpload, uploadToGoogleDrive } from "@/lib/google-drive";
import { jsonError, jsonOk } from "@/lib/http";
import {
  importPayoutFile,
  importStatementFile,
  listStatementBankAccounts,
  validatePayoutFileBeforeUpload,
  validateStatementFileBeforeUpload
} from "@/lib/statement-import";

export const runtime = "nodejs";

const DEFAULT_MAX_FILE_SIZE = 20 * 1024 * 1024;

function uploadType(value: unknown) {
  const type = String(value || "statement").trim();
  if (type === "payout" || type === "bulk") return "bulk_payout";
  if (type === "payout_time") return "payout_time";
  if (type === "bulk_payout") return "bulk_payout";
  return "statement";
}

function maxUploadSize() {
  const value = Number(process.env.GOOGLE_DRIVE_MAX_UPLOAD_BYTES || DEFAULT_MAX_FILE_SIZE);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_FILE_SIZE;
}

function cleanFileName(fileName: string) {
  return fileName.replace(/[^\w.\-ก-๙ ]+/g, "_").replace(/\s+/g, " ").trim() || "upload";
}

function isMissingTableError(message: string) {
  return /schema cache|does not exist|Could not find the table/i.test(message);
}

function fromGoogleDriveUpload(row: Record<string, unknown>) {
  return {
    id: row.id,
    upload_type: row.folder_type,
    file_name: row.file_name,
    mime_type: row.mime_type,
    file_size: row.file_size,
    drive_file_id: row.drive_file_id,
    web_view_link: row.drive_url,
    web_content_link: row.drive_url,
    uploaded_by: row.uploaded_by,
    note: null,
    created_at: row.created_at
  };
}

async function listDriveUploads(type: string, limit: number) {
  const supabase = getSupabaseAdmin();
  const primary = await supabase
    .from("drive_uploads")
    .select("*")
    .eq("upload_type", type)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!primary.error) return { rows: primary.data || [], warning: undefined };
  if (!isMissingTableError(primary.error.message)) throw new Error(primary.error.message);

  const fallback = await supabase
    .from("google_drive_uploads")
    .select("*")
    .eq("folder_type", type === "bulk_payout" ? "payout_time" : type)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (fallback.error) {
    if (isMissingTableError(fallback.error.message)) {
      return {
        rows: [],
        warning: "ยังไม่มีตาราง drive_uploads/google_drive_uploads; รัน migration Google Drive ก่อนใช้ประวัติไฟล์"
      };
    }
    throw new Error(fallback.error.message);
  }
  return {
    rows: (fallback.data || []).map((row) => fromGoogleDriveUpload(row as Record<string, unknown>)),
    warning: "ใช้ประวัติจาก google_drive_uploads"
  };
}

async function saveDriveUpload(payload: {
  upload_type: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  drive_file_id: string;
  web_view_link: string;
  web_content_link: string;
  uploaded_by: string;
  note: string;
}) {
  const supabase = getSupabaseAdmin();
  const primary = await supabase.from("drive_uploads").insert(payload).select("*").single();
  if (!primary.error) return { row: primary.data, warning: undefined };
  if (!isMissingTableError(primary.error.message)) return { row: payload, warning: primary.error.message };

  const fallback = await recordDriveUpload({
    folderType: payload.upload_type === "bulk_payout" ? "payout_time" : payload.upload_type,
    upload: {
      drive_file_id: payload.drive_file_id,
      file_name: payload.file_name,
      mime_type: payload.mime_type,
      file_size: payload.file_size,
      drive_url: payload.web_view_link,
      web_view_link: payload.web_view_link,
      web_content_link: payload.web_content_link,
      created_time: new Date().toISOString()
    },
    uploadedBy: payload.uploaded_by
  });
  if (!fallback.saved) return { row: payload, warning: `drive_uploads: ${primary.error.message}; google_drive_uploads: ${fallback.warning}` };
  return { row: payload, warning: "บันทึกประวัติลง google_drive_uploads แทน drive_uploads" };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("accounts") === "1") {
      const rows = await listStatementBankAccounts();
      return jsonOk({ success: true, rows });
    }
    const type = uploadType(url.searchParams.get("type") || "");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 20), 1), 50);
    const uploads = await listDriveUploads(type, limit);
    return jsonOk({ success: true, rows: uploads.rows, warning: uploads.warning });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Load uploads failed", 500);
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError("กรุณาเลือกไฟล์");
    if (file.size <= 0) return jsonError("ไฟล์ว่าง กรุณาเลือกไฟล์ใหม่");
    const maxSize = maxUploadSize();
    if (file.size > maxSize) return jsonError(`ไฟล์ใหญ่เกินกำหนด ${(maxSize / 1024 / 1024).toFixed(0)}MB`);

    const type = uploadType(form.get("type"));
    const uploadedBy = String(form.get("uploaded_by") || "admin");
    const note = String(form.get("note") || "");
    const accountId = String(form.get("account_id") || "");
    const bank = String(form.get("bank") || "");
    const payoutSourceAccountId = String(form.get("payout_source_account_id") || "");
    const buffer = Buffer.from(await file.arrayBuffer());
    const csvText = buffer.toString("utf8");

    if (type === "statement") {
      await validateStatementFileBeforeUpload({
        csvText,
        fileName: file.name,
        uploadedBy,
        accountId,
        bank
      });
    } else {
      await validatePayoutFileBeforeUpload({
        csvText,
        fileName: file.name,
        sourceAccountId: payoutSourceAccountId
      });
    }

    const folderType = type === "statement" ? "statement" : "payout_time";
    const driveFile = await uploadToGoogleDrive({
      fileName: cleanFileName(file.name),
      mimeType: file.type || "application/octet-stream",
      buffer,
      folderType
    });

    const payload = {
      upload_type: type,
      file_name: driveFile.file_name,
      mime_type: driveFile.mime_type,
      file_size: driveFile.file_size,
      drive_file_id: driveFile.drive_file_id,
      web_view_link: driveFile.web_view_link,
      web_content_link: driveFile.web_content_link,
      uploaded_by: uploadedBy,
      note
    };

    const importResult = type === "statement"
      ? await importStatementFile({
        csvText,
        fileName: file.name,
        uploadedBy,
        accountId,
        bank,
        driveFile
      })
      : await importPayoutFile({
        csvText,
        fileName: file.name,
        uploadedBy,
        driveFile,
        sourceAccountId: payoutSourceAccountId
      });
    const savedUpload = await saveDriveUpload(payload);
    if (savedUpload.warning) {
      return jsonOk({
        success: true,
        warning: `อัปโหลดและ import สำเร็จ แต่บันทึกประวัติ Drive มีหมายเหตุ: ${savedUpload.warning}`,
        row: savedUpload.row,
        import: importResult
      });
    }
    return jsonOk({ success: true, row: savedUpload.row, import: importResult });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Drive upload failed";
    const status = /กรุณาเชื่อม Google Drive/.test(message) ? 409 : 500;
    return jsonError(message, status);
  }
}
