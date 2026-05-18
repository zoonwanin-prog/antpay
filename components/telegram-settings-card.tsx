"use client";

import { useState } from "react";
import { Bot, Save, Send } from "lucide-react";

type TelegramTarget = {
  target: "transfer" | "crypto" | "ticket" | "alert";
  chatId: string;
  threadId: string;
  chatSource: string;
  threadSource: string;
};

type TokenStatus = {
  hasToken: boolean;
  source: string;
  masked: string;
};

const labels: Record<TelegramTarget["target"], string> = {
  transfer: "TRANSFER",
  crypto: "CRYPTO",
  ticket: "TICKET",
  alert: "ALERT"
};

export function TelegramSettingsCard({
  initialRows,
  initialTokenStatus
}: {
  initialRows: TelegramTarget[];
  initialTokenStatus: TokenStatus;
}) {
  const [rows, setRows] = useState<TelegramTarget[]>(initialRows);
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>(initialTokenStatus);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  function update(target: string, field: "chatId" | "threadId", value: string) {
    setRows((current) => current.map((row) => row.target === target ? { ...row, [field]: value } : row));
  }

  function applyResponse(json: { rows?: TelegramTarget[]; tokenStatus?: TokenStatus }) {
    if (json.rows) setRows(json.rows);
    if (json.tokenStatus) setTokenStatus(json.tokenStatus);
  }

  async function saveToken() {
    setBusy("token");
    setMessage("");
    try {
      const res = await fetch("/api/telegram-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save_token", token })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "บันทึก Telegram token ไม่สำเร็จ");
      applyResponse(json);
      setToken("");
      setMessage("บันทึก Telegram token สำเร็จ");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึก Telegram token ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  async function saveTarget(target: TelegramTarget["target"]) {
    const row = rows.find((item) => item.target === target);
    if (!row) return;
    setBusy(`save-${target}`);
    setMessage("");
    try {
      const res = await fetch("/api/telegram-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target, chatId: row.chatId, threadId: row.threadId })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "บันทึก Telegram ไม่สำเร็จ");
      applyResponse(json);
      setMessage(`บันทึก ${labels[target]} สำเร็จ`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึก Telegram ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  async function testTarget(target: TelegramTarget["target"]) {
    setBusy(`test-${target}`);
    setMessage("");
    try {
      const res = await fetch("/api/telegram-settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "ทดสอบส่ง Telegram ไม่สำเร็จ");
      setMessage(`ทดสอบส่ง ${labels[target]} สำเร็จ`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ทดสอบส่ง Telegram ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  const ok = /สำเร็จ/.test(message);
  return (
    <div className="panel settings-card telegram-settings-card">
      <div className="panel-header">
        <div>
          <h2><Bot size={18} /> Telegram targets</h2>
          <p>ตั้งค่า bot token, chat id และ thread id สำหรับแจ้งเตือน</p>
        </div>
      </div>
      <div className="telegram-settings-body">
        <div className="telegram-token-row">
          <label>
            <span>Bot Token <small>{tokenStatus.source} · {tokenStatus.masked}</small></span>
            <input
              type="password"
              value={token}
              placeholder="TELEGRAM_BOT_TOKEN"
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
          <button type="button" disabled={busy === "token" || !token.trim()} onClick={saveToken}>
            <Save size={14} />
            <span>{busy === "token" ? "บันทึก..." : "บันทึก Token"}</span>
          </button>
        </div>

        <div className="telegram-target-list">
          {rows.map((row) => (
            <div className="telegram-target-row" key={row.target}>
              <strong>{labels[row.target]}</strong>
              <label>
                <span>chat id <small>{row.chatSource}</small></span>
                <input value={row.chatId} placeholder="chat id" onChange={(event) => update(row.target, "chatId", event.target.value)} />
              </label>
              <label>
                <span>thread <small>{row.threadSource}</small></span>
                <input value={row.threadId} placeholder="thread id" onChange={(event) => update(row.target, "threadId", event.target.value)} />
              </label>
              <button type="button" disabled={busy === `save-${row.target}`} onClick={() => saveTarget(row.target)}>
                <Save size={14} />
                <span>{busy === `save-${row.target}` ? "บันทึก..." : "บันทึก"}</span>
              </button>
              <button type="button" className="btn-secondary" disabled={busy === `test-${row.target}`} onClick={() => testTarget(row.target)}>
                <Send size={14} />
                <span>{busy === `test-${row.target}` ? "ส่ง..." : "ทดสอบส่ง"}</span>
              </button>
            </div>
          ))}
        </div>
        {message ? <div className={`msg ${ok ? "msg-success" : "msg-error"} settings-inline-message`}>{message}</div> : null}
      </div>
    </div>
  );
}
