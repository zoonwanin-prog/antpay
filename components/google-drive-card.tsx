"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Cloud, Plug, PlugZap, RotateCcw, TriangleAlert } from "lucide-react";

type Status = {
  connected: boolean;
  email?: string | null;
  scope?: string | null;
  expiry_date?: string | null;
  updated_at?: string | null;
  has_refresh_token?: boolean;
  missing_env?: string[];
};

const dateTimeFormatter = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Bangkok"
});

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  try {
    return dateTimeFormatter.format(new Date(value));
  } catch {
    return value;
  }
}

export function GoogleDriveCard({ returnTo = "/settings/system" }: { returnTo?: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "connect" | "disconnect">("");
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"" | "ok" | "err">("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/google/oauth/status", { cache: "no-store" });
      const json = (await res.json()) as Status & { success?: boolean; message?: string };
      if (!json.success) throw new Error((json.message as string) || "โหลดสถานะไม่สำเร็จ");
      setStatus(json);
    } catch (err) {
      setStatus(null);
      setTone("err");
      setMessage(err instanceof Error ? err.message : "โหลดสถานะไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const flag = params.get("google_drive");
      if (flag === "connected") {
        setTone("ok");
        setMessage("เชื่อม Google Drive สำเร็จ");
      } else if (flag === "error") {
        setTone("err");
        setMessage(`เชื่อมไม่สำเร็จ: ${params.get("message") || "unknown"}`);
      }
      if (flag) {
        params.delete("google_drive");
        params.delete("message");
        const query = params.toString();
        const cleanUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
        window.history.replaceState({}, "", cleanUrl);
      }
    }
  }, [refresh]);

  function connect() {
    setBusy("connect");
    window.location.href = `/api/google/oauth/start?return=${encodeURIComponent(returnTo)}`;
  }

  async function disconnect() {
    if (!window.confirm("ยกเลิกการเชื่อม Google Drive ใช่ไหม?")) return;
    setBusy("disconnect");
    setMessage("");
    setTone("");
    try {
      const res = await fetch("/api/google/oauth/status", { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "ยกเลิกการเชื่อมไม่สำเร็จ");
      setTone("ok");
      setMessage("ยกเลิกการเชื่อมแล้ว");
      await refresh();
    } catch (err) {
      setTone("err");
      setMessage(err instanceof Error ? err.message : "ยกเลิกไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  const missingEnv = status?.missing_env || [];
  const cannotConnect = missingEnv.length > 0;
  const cardTone = status?.connected ? "good" : cannotConnect ? "warn" : "default";
  const valueText = loading ? "..." : status?.connected ? "เชื่อมแล้ว" : "ยังไม่เชื่อม";

  return (
    <div className={`card metric-card tone-${cardTone} google-drive-card`}>
      <div className="metric-top">
        <p className="metric">Google Drive</p>
        <span className="metric-icon"><Cloud size={18} /></span>
      </div>
      <p className="value">{valueText}</p>
      {status?.connected ? (
        <p className="metric-hint">
          {status.email || "-"}
          {status.expiry_date ? ` · หมดอายุ ${formatDateTime(status.expiry_date)}` : ""}
        </p>
      ) : cannotConnect ? (
        <p className="metric-hint" style={{ color: "var(--danger, #b91c1c)" }}>
          <TriangleAlert size={12} /> ENV ที่ขาด: {missingEnv.join(", ")}
        </p>
      ) : (
        <p className="metric-hint">กดเชื่อมเพื่ออัปโหลดสลิป/Statement</p>
      )}
      <div className="google-drive-card-actions">
        {status?.connected ? (
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={connect}
              disabled={busy !== "" || cannotConnect}
            >
              <RotateCcw size={14} />
              <span>{busy === "connect" ? "..." : "เชื่อมใหม่"}</span>
            </button>
            <button
              type="button"
              className="btn-del"
              onClick={disconnect}
              disabled={busy !== ""}
            >
              <Plug size={14} />
              <span>{busy === "disconnect" ? "..." : "ยกเลิก"}</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn-primary-submit"
            onClick={connect}
            disabled={busy !== "" || cannotConnect}
          >
            <PlugZap size={14} />
            <span>{busy === "connect" ? "กำลังเปิด Google..." : "เชื่อม Google Drive"}</span>
          </button>
        )}
      </div>
      {message ? (
        <p
          className="metric-hint"
          style={{
            color: tone === "err" ? "var(--danger, #b91c1c)" : tone === "ok" ? "var(--good, #16a34a)" : undefined,
            marginTop: 6
          }}
        >
          {tone === "ok" ? <CheckCircle2 size={12} /> : tone === "err" ? <TriangleAlert size={12} /> : null}
          {" "}{message}
        </p>
      ) : null}
    </div>
  );
}
