import { jsonError, jsonOk } from "@/lib/http";
import {
  describeConnectionStatus,
  recordDriveUpload,
  uploadToGoogleDrive,
  type DriveFolderType
} from "@/lib/google-drive";

export const runtime = "nodejs";

const DEFAULT_MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_FOLDER_TYPES: DriveFolderType[] = ["slip", "statement", "payout_time"];

function maxUploadSize() {
  const value = Number(process.env.GOOGLE_DRIVE_MAX_UPLOAD_BYTES || DEFAULT_MAX_FILE_SIZE);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_FILE_SIZE;
}

function cleanFileName(fileName: string) {
  return (
    fileName
      .replace(/[^\w.\-ก-๙ ]+/g, "_")
      .replace(/\s+/g, " ")
      .trim() || "upload"
  );
}

function normalizeFolderType(value: unknown): DriveFolderType {
  const raw = String(value || "").trim().toLowerCase();
  if (ALLOWED_FOLDER_TYPES.includes(raw)) return raw as DriveFolderType;
  return "slip";
}

export async function GET() {
  try {
    const status = await describeConnectionStatus();
    return jsonOk({ success: true, ...status });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Load drive status failed", 500);
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError("กรุณาเลือกไฟล์");
    if (file.size <= 0) return jsonError("ไฟล์ว่าง กรุณาเลือกไฟล์ใหม่");
    const maxSize = maxUploadSize();
    if (file.size > maxSize) {
      return jsonError(`ไฟล์ใหญ่เกินกำหนด ${(maxSize / 1024 / 1024).toFixed(0)}MB`);
    }

    const folderType = normalizeFolderType(form.get("folderType") || form.get("folder_type"));
    const uploadedBy = String(form.get("uploaded_by") || form.get("uploadedBy") || "admin");
    const relatedTable = (form.get("related_table") as string | null) || null;
    const relatedIdRaw = (form.get("related_id") as string | null) || null;
    const relatedId = relatedIdRaw && /^[0-9a-fA-F-]{8,}$/.test(relatedIdRaw) ? relatedIdRaw : null;

    const buffer = Buffer.from(await file.arrayBuffer());
    const upload = await uploadToGoogleDrive({
      fileName: cleanFileName(file.name),
      mimeType: file.type || "application/octet-stream",
      buffer,
      folderType
    });

    const record = await recordDriveUpload({
      folderType,
      upload,
      uploadedBy,
      relatedTable,
      relatedId
    });

    return jsonOk({
      success: true,
      drive_file_id: upload.drive_file_id,
      drive_url: upload.drive_url,
      file_name: upload.file_name,
      mime_type: upload.mime_type,
      file_size: upload.file_size,
      folder_type: folderType,
      warning: record.saved ? undefined : `อัปโหลดเข้า Drive สำเร็จ แต่บันทึก ${"google_drive_uploads"} ไม่สำเร็จ: ${record.warning}`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Drive upload failed";
    const status = /กรุณาเชื่อม Google Drive/.test(message) ? 409 : 500;
    return jsonError(message, status);
  }
}
