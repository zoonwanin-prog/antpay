"use client";

import { useState } from "react";
import { KeyRound, Save } from "lucide-react";

type PasswordStatus = {
  enabled: boolean;
  masked: string;
};

export function DrivePasswordCard({ initialStatus }: { initialStatus: PasswordStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function savePassword() {
    setMessage("");
    const cleanPassword = password.trim();
    if (!cleanPassword) {
      setMessage("กรุณากรอกรหัสผ่าน");
      return;
    }
    if (cleanPassword !== confirmPassword.trim()) {
      setMessage("รหัสผ่านสองช่องไม่ตรงกัน");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/statement-tools/drive-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save", password: cleanPassword })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "บันทึกรหัสผ่านไม่สำเร็จ");
      setStatus({ enabled: Boolean(json.enabled), masked: json.masked || "********" });
      setPassword("");
      setConfirmPassword("");
      setMessage("บันทึกรหัสผ่านเปิดไฟล์ Statement Drive สำเร็จ");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกรหัสผ่านไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const ok = /สำเร็จ/.test(message);
  return (
    <div className="panel settings-card drive-password-card">
      <div className="panel-header">
        <div>
          <h2><KeyRound size={18} /> รหัสเปิดไฟล์ Statement</h2>
          <p>ใช้ถามรหัสก่อนเปิดไฟล์ Statement/Payout บน Google Drive</p>
        </div>
      </div>
      <div className="settings-env-list">
        <div className="summary-split-row">
          <span>สถานะ</span>
          <strong>{status.enabled ? "เปิดใช้งาน" : "ยังไม่ตั้งรหัส"}</strong>
        </div>
        <div className="summary-split-row">
          <span>รหัส</span>
          <strong>{status.masked}</strong>
        </div>
        <label className="token-admin-field">
          <span>รหัสผ่านใหม่</span>
          <input
            type="password"
            value={password}
            placeholder="ตั้งรหัสก่อนเปิดไฟล์ Drive"
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className="token-admin-field">
          <span>ยืนยันรหัสผ่าน</span>
          <input
            type="password"
            value={confirmPassword}
            placeholder="กรอกรหัสซ้ำ"
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>
        <div className="token-admin-actions">
          <button type="button" disabled={busy || !password.trim()} onClick={savePassword}>
            <Save size={15} />
            <span>{busy ? "กำลังบันทึก..." : "บันทึกรหัสผ่าน"}</span>
          </button>
        </div>
        {message ? <div className={`msg ${ok ? "msg-success" : "msg-error"} settings-inline-message`}>{message}</div> : null}
      </div>
    </div>
  );
}
