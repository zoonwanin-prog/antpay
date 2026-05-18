export type DriveUploadResult = {
  drive_file_id: string;
  drive_url: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  folder_type: string;
};

export type FolderType = "slip" | "statement" | "payout_time";

/**
 * Browser-side helper that uploads a file to /api/google-drive/upload and returns the Drive URL.
 * Throws when Google Drive isn't connected so the caller can surface "กรุณาเชื่อม Google Drive ก่อน".
 */
export async function uploadFileToDrive(
  file: File,
  options: { folderType: FolderType; uploadedBy?: string; relatedTable?: string; relatedId?: string }
): Promise<DriveUploadResult> {
  const form = new FormData();
  form.set("file", file);
  form.set("folderType", options.folderType);
  if (options.uploadedBy) form.set("uploaded_by", options.uploadedBy);
  if (options.relatedTable) form.set("related_table", options.relatedTable);
  if (options.relatedId) form.set("related_id", options.relatedId);

  const res = await fetch("/api/google-drive/upload", { method: "POST", body: form });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    drive_file_id?: string;
    drive_url?: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
    folder_type?: string;
    warning?: string;
  };
  if (!res.ok || !json.success) {
    throw new Error(json.message || `อัปโหลด Google Drive ไม่สำเร็จ (HTTP ${res.status})`);
  }
  return {
    drive_file_id: json.drive_file_id || "",
    drive_url: json.drive_url || "",
    file_name: json.file_name || file.name,
    mime_type: json.mime_type || file.type,
    file_size: Number(json.file_size || file.size),
    folder_type: json.folder_type || options.folderType
  };
}
