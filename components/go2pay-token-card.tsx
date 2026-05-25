"use client";

import { useState } from "react";
import { KeyRound, Save, ShieldCheck, TestTube2 } from "lucide-react";

type TokenStatus = {
  hasToken: boolean;
  source: string;
  masked: string;
};

export function Go2PayTokenCard({ initialStatus }: { initialStatus: TokenStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<"" | "test" | "save">("");
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);

  async function testToken() {
    setBusy("test");
    setMessage("");
    setOk(false);
    try {
      const res = await fetch("/api/go2pay-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "ทดสอบ API ไม่สำเร็จ");
      setOk(true);
      setMessage(json.warnings ? `Token ใช้ได้บางส่วน: ${json.checks}` : `ทดสอบ API สำเร็จ: ${json.checks || `HTTP ${json.status || 200}`}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ทดสอบ API ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  async function saveToken() {
    setBusy("save");
    setMessage("");
    setOk(false);
    try {
      const res = await fetch("/api/go2pay-token", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "บันทึก token ไม่สำเร็จ");
      setStatus({ hasToken: json.hasToken, source: json.source, masked: json.masked });
      setToken("");
      setOk(true);
      setMessage(json.warnings ? `บันทึก token แล้ว แต่บาง endpoint ยังไม่พร้อม: ${json.checks}` : `บันทึก token แล้ว: ${json.checks || "ทดสอบ API สำเร็จ"}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึก token ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="panel settings-card token-admin-card">
      <div className="panel-header">
        <div>
          <h2><KeyRound size={18} /> Antpay admin token</h2>
          <p>ทดสอบ Antpay API และบันทึก token override ฝั่ง server</p>
        </div>
      </div>
      <div className="settings-env-list">
        <div className="summary-split-row"><span>ANTPAY</span><strong>{status.hasToken ? "พร้อมใช้งาน" : "ยังไม่ได้ตั้งค่า"}</strong></div>
        <div className="summary-split-row"><span>source</span><strong>{status.source}</strong></div>
        <div className="summary-split-row"><span>masked</span><strong>{status.masked}</strong></div>
        <label className="token-admin-field">
          <span>แก้ไข token</span>
          <input
            type="password"
            value={token}
            placeholder="วาง Antpay admin token ใหม่"
            onChange={(event) => setToken(event.target.value)}
          />
        </label>
        <div className="token-admin-actions">
          <button type="button" className="btn-secondary" disabled={busy !== ""} onClick={testToken}>
            <TestTube2 size={15} />
            <span>{busy === "test" ? "กำลังทดสอบ..." : "ทดสอบ API"}</span>
          </button>
          <button type="button" disabled={busy !== "" || !token.trim()} onClick={saveToken}>
            {busy === "save" ? <ShieldCheck size={15} /> : <Save size={15} />}
            <span>{busy === "save" ? "กำลังบันทึก..." : "บันทึก token"}</span>
          </button>
        </div>
        {message ? <div className={`msg ${ok ? "msg-success" : "msg-error"} settings-inline-message`}>{message}</div> : null}
      </div>
    </div>
  );
}
