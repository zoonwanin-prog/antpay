import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";

export const GOOGLE_DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email"
];

export const TOKEN_TABLE = "google_oauth_tokens";
export const UPLOAD_TABLE = "google_drive_uploads";

export type DriveFolderType = "slip" | "statement" | "payout_time" | string;

export type UploadInput = {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  folderType?: DriveFolderType;
  parentFolderId?: string;
  makeReadable?: boolean;
};

export type UploadResult = {
  drive_file_id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  drive_url: string;
  web_view_link: string;
  web_content_link: string;
  created_time: string;
};

export type GoogleTokenRow = {
  id: string;
  provider: string;
  google_email: string | null;
  access_token: string;
  refresh_token: string | null;
  expiry_date: string | null;
  scope: string | null;
  token_type: string | null;
  created_at: string;
  updated_at: string;
};

type RefreshResponse = {
  access_token: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

type ExchangeResponse = RefreshResponse & {
  id_token?: string;
};

function requireOAuthEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing Google OAuth env: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI");
  }
  return { clientId, clientSecret, redirectUri };
}

export function folderIdFor(folderType?: DriveFolderType): string | null {
  if (folderType === "slip") return process.env.GOOGLE_DRIVE_FOLDER_SLIPS || null;
  if (folderType === "statement") return process.env.GOOGLE_DRIVE_FOLDER_STATEMENTS || null;
  if (folderType === "payout_time") return process.env.GOOGLE_DRIVE_FOLDER_PAYOUT_TIME || null;
  return process.env.GOOGLE_DRIVE_FOLDER_ID || null;
}

export function buildOAuthStartUrl(state: string): string {
  const { clientId, redirectUri } = requireOAuthEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_DRIVE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<ExchangeResponse> {
  const { clientId, clientSecret, redirectUri } = requireOAuthEnv();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });
  const json = (await res.json()) as ExchangeResponse;
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Google OAuth token exchange failed");
  }
  return json;
}

async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { email?: string };
    return json.email || null;
  } catch {
    return null;
  }
}

export async function persistTokenFromExchange(tokens: ExchangeResponse): Promise<GoogleTokenRow> {
  const expiresIn = Number(tokens.expires_in || 3600);
  const expiryDate = new Date(Date.now() + expiresIn * 1000).toISOString();
  const email = await fetchGoogleEmail(tokens.access_token);

  const existing = await loadStoredToken();
  const supabase = getSupabaseAdmin();
  const baseRow = {
    provider: "google",
    google_email: email || existing?.google_email || null,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || existing?.refresh_token || null,
    expiry_date: expiryDate,
    scope: tokens.scope || existing?.scope || GOOGLE_DRIVE_SCOPES.join(" "),
    token_type: tokens.token_type || "Bearer",
    updated_at: new Date().toISOString()
  };

  if (existing) {
    const { data, error } = await supabase
      .from(TOKEN_TABLE)
      .update(baseRow)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as GoogleTokenRow;
  }

  const { data, error } = await supabase
    .from(TOKEN_TABLE)
    .insert({ ...baseRow, created_at: new Date().toISOString() })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as GoogleTokenRow;
}

export async function loadStoredToken(): Promise<GoogleTokenRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TOKEN_TABLE)
    .select("*")
    .eq("provider", "google")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (/schema cache|does not exist|Could not find the table/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  return (data as GoogleTokenRow) || null;
}

export async function clearStoredToken(): Promise<void> {
  const { error } = await getSupabaseAdmin().from(TOKEN_TABLE).delete().eq("provider", "google");
  if (error && !/schema cache|does not exist|Could not find the table/i.test(error.message)) {
    throw new Error(error.message);
  }
}

async function refreshAccessToken(refreshToken: string): Promise<RefreshResponse> {
  const { clientId, clientSecret } = requireOAuthEnv();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });
  const json = (await res.json()) as RefreshResponse;
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Google OAuth refresh failed");
  }
  return json;
}

export async function getValidAccessToken(): Promise<{ accessToken: string; token: GoogleTokenRow }> {
  const token = await loadStoredToken();
  if (!token) throw new Error("กรุณาเชื่อม Google Drive ก่อน");
  const now = Date.now();
  const expiryMs = token.expiry_date ? new Date(token.expiry_date).getTime() : 0;
  // Refresh 60s before expiry to absorb clock skew
  if (token.access_token && expiryMs - now > 60_000) {
    return { accessToken: token.access_token, token };
  }
  if (!token.refresh_token) {
    throw new Error("ไม่พบ refresh token ของ Google Drive กรุณาเชื่อม Google Drive ใหม่อีกครั้ง");
  }
  const refreshed = await refreshAccessToken(token.refresh_token);
  const newExpiry = new Date(now + Number(refreshed.expires_in || 3600) * 1000).toISOString();
  const update = {
    access_token: refreshed.access_token,
    token_type: refreshed.token_type || token.token_type || "Bearer",
    scope: refreshed.scope || token.scope,
    expiry_date: newExpiry,
    refresh_token: refreshed.refresh_token || token.refresh_token,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await getSupabaseAdmin()
    .from(TOKEN_TABLE)
    .update(update)
    .eq("id", token.id)
    .select("*")
    .single();
  if (error) {
    // Persist failure shouldn't break the upload; surface a console warning but return refreshed access token.
    console.warn("[google-drive] failed to persist refreshed token:", error.message);
    return { accessToken: refreshed.access_token, token: { ...token, ...update } as GoogleTokenRow };
  }
  return { accessToken: refreshed.access_token, token: data as GoogleTokenRow };
}

function multipartBody(metadata: Record<string, unknown>, file: UploadInput, boundary: string) {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\ncontent-type: ${file.mimeType || "application/octet-stream"}\r\n\r\n`),
    file.buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
}

async function shareWithAnyone(accessToken: string, fileId: string): Promise<void> {
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ role: "reader", type: "anyone" })
    });
  } catch (err) {
    console.warn("[google-drive] failed to add public reader permission:", err);
  }
}

export async function uploadToGoogleDrive(input: UploadInput): Promise<UploadResult> {
  const { accessToken } = await getValidAccessToken();
  const folderId = input.parentFolderId || folderIdFor(input.folderType);
  const metadata: Record<string, unknown> = { name: input.fileName };
  if (folderId) metadata.parents = [folderId];

  const boundary = `antpay-${crypto.randomUUID()}`;
  const body = multipartBody(metadata, input, boundary);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink,webContentLink,createdTime",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": `multipart/related; boundary=${boundary}`,
        "content-length": String(body.length)
      },
      body
    }
  );
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok || !json.id) {
    const err = json.error as { message?: string } | undefined;
    throw new Error(err?.message || "Google Drive upload failed");
  }

  const id = String(json.id);
  if (input.makeReadable !== false) {
    await shareWithAnyone(accessToken, id);
  }

  const driveUrl = String(json.webViewLink || `https://drive.google.com/file/d/${id}/view`);
  return {
    drive_file_id: id,
    file_name: String(json.name || input.fileName),
    mime_type: String(json.mimeType || input.mimeType),
    file_size: Number(json.size || input.buffer.length),
    drive_url: driveUrl,
    web_view_link: driveUrl,
    web_content_link: String(json.webContentLink || `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`),
    created_time: String(json.createdTime || new Date().toISOString())
  };
}

export function extractDriveFileId(url: string): string | null {
  if (!url) return null;
  const fileMatch = /\/file\/d\/([a-zA-Z0-9_-]+)/.exec(url);
  if (fileMatch) return fileMatch[1];
  const idParam = /[?&]id=([a-zA-Z0-9_-]+)/.exec(url);
  if (idParam) return idParam[1];
  const ucMatch = /\/uc\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/.exec(url);
  if (ucMatch) return ucMatch[1];
  return null;
}

export async function downloadDriveFile(fileId: string): Promise<{
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}> {
  if (!fileId) throw new Error("missing Drive file id");
  const { accessToken } = await getValidAccessToken();
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name,mimeType,size&supportsAllDrives=true`,
    { headers: { authorization: `Bearer ${accessToken}` } }
  );
  if (!metaRes.ok) {
    throw new Error(`Drive metadata fetch failed: HTTP ${metaRes.status} ${await metaRes.text()}`);
  }
  const meta = (await metaRes.json()) as { name?: string; mimeType?: string };
  const contentRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { headers: { authorization: `Bearer ${accessToken}` } }
  );
  if (!contentRes.ok) {
    throw new Error(`Drive download failed: HTTP ${contentRes.status} ${await contentRes.text()}`);
  }
  const buffer = Buffer.from(await contentRes.arrayBuffer());
  return {
    buffer,
    mimeType: String(meta.mimeType || "application/octet-stream"),
    fileName: String(meta.name || `drive-${fileId}`)
  };
}

export async function recordDriveUpload(args: {
  folderType: string;
  upload: UploadResult;
  uploadedBy?: string | null;
  relatedTable?: string | null;
  relatedId?: string | null;
}): Promise<{ saved: boolean; warning?: string }> {
  const payload = {
    folder_type: args.folderType,
    file_name: args.upload.file_name,
    mime_type: args.upload.mime_type,
    file_size: args.upload.file_size,
    drive_file_id: args.upload.drive_file_id,
    drive_url: args.upload.drive_url,
    uploaded_by: args.uploadedBy || null,
    related_table: args.relatedTable || null,
    related_id: args.relatedId || null
  };
  const { error } = await getSupabaseAdmin().from(UPLOAD_TABLE).insert(payload);
  if (error) {
    return { saved: false, warning: error.message };
  }
  return { saved: true };
}

export type ConnectionStatus = {
  connected: boolean;
  email?: string | null;
  scope?: string | null;
  expiry_date?: string | null;
  updated_at?: string | null;
  has_refresh_token?: boolean;
  missing_env?: string[];
};

export function describeMissingEnv(): string[] {
  const missing: string[] = [];
  if (!process.env.GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (!process.env.GOOGLE_REDIRECT_URI) missing.push("GOOGLE_REDIRECT_URI");
  return missing;
}

export async function describeConnectionStatus(): Promise<ConnectionStatus> {
  const missing = describeMissingEnv();
  const token = await loadStoredToken().catch(() => null);
  if (!token) {
    return { connected: false, missing_env: missing };
  }
  return {
    connected: true,
    email: token.google_email,
    scope: token.scope,
    expiry_date: token.expiry_date,
    updated_at: token.updated_at,
    has_refresh_token: Boolean(token.refresh_token),
    missing_env: missing
  };
}
