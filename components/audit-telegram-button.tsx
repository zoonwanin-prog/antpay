"use client";

import { useState } from "react";
import { Send } from "lucide-react";

export function AuditTelegramButton({ date }: { date: string }) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  async function send() {
    setSending(true);
    setMessage("");
    try {
      const res = await fetch("/api/audit/send-telegram", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date })
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || payload.message || "ส่ง Telegram ไม่สำเร็จ");
      setMessage("ส่งแล้ว");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ส่ง Telegram ไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="audit-telegram-action">
      <button type="button" onClick={send} disabled={sending}>
        <Send size={14} />
        <span>{sending ? "กำลังส่ง..." : "ส่ง Telegram"}</span>
      </button>
      {message ? <span className={`audit-telegram-status ${message === "ส่งแล้ว" ? "is-success" : "is-error"}`}>{message}</span> : null}
    </div>
  );
}
