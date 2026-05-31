import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;

function header(request: Request, name: string) {
  return String(request.headers.get(name) || "").trim();
}

export async function POST(request: Request) {
  try {
    const uploadUrl = decodeURIComponent(header(request, "x-upload-url"));
    const start = Number(header(request, "x-chunk-start"));
    const end = Number(header(request, "x-chunk-end"));
    const total = Number(header(request, "x-file-size"));
    const mimeType = header(request, "x-file-type") || "text/csv";
    if (!uploadUrl.startsWith("https://www.googleapis.com/")) return jsonError("Google Drive upload session ไม่ถูกต้อง");
    if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(total) || start < 0 || end < start || total <= 0) {
      return jsonError("ข้อมูล chunk ไม่ถูกต้อง");
    }

    const body = Buffer.from(await request.arrayBuffer());
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "content-type": mimeType,
        "content-length": String(body.length),
        "content-range": `bytes ${start}-${end}/${total}`
      },
      body
    });

    if (res.status === 308) {
      return jsonOk({ success: true, done: false });
    }

    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      if (!res.ok) throw new Error(text || `Google Drive upload failed (HTTP ${res.status})`);
    }
    if (!res.ok || !json.id) {
      const error = json.error as { message?: string } | undefined;
      throw new Error(error?.message || text || `Google Drive upload failed (HTTP ${res.status})`);
    }
    return jsonOk({ success: true, done: true, file: json });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Upload chunk failed", 500);
  }
}
