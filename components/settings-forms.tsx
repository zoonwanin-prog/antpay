"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Bitcoin, Building2, CheckCircle2, Plus, TriangleAlert, UserPlus } from "lucide-react";

type Status = { type: "" | "ok" | "err"; message: string };

async function postSetting(payload: Record<string, unknown>) {
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || "บันทึกไม่สำเร็จ");
  return json;
}

export function SettingsForms() {
  const [status, setStatus] = useState<Status>({ type: "", message: "" });
  const [saving, setSaving] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>, kind: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    setSaving(kind);
    setStatus({ type: "", message: "" });
    try {
      await postSetting({ kind, ...payload });
      setStatus({ type: "ok", message: "บันทึกการตั้งค่าสำเร็จ" });
      form.reset();
      window.location.reload();
    } catch (error) {
      setStatus({ type: "err", message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด" });
    } finally {
      setSaving("");
    }
  }

  return (
    <section className="settings-grid" aria-label="ฟอร์มเพิ่มการตั้งค่าระบบ">
      <form className="panel form-box settings-card" onSubmit={(event) => submit(event, "bank_account")}>
        <div className="panel-header">
          <div>
            <h2><Building2 size={18} /> เพิ่มบัญชีธนาคาร</h2>
            <p>ใช้เป็น master data สำหรับเลือกบัญชีในระบบ</p>
          </div>
        </div>
        <div className="form-body settings-form-body settings-add-form">
          <label>
            <span>ชื่อบัญชี</span>
            <input name="name" placeholder="ระบุชื่อบัญชี" required />
          </label>
          <label>
            <span>เลขบัญชี / PromptPay</span>
            <input name="account_no" placeholder="ระบุเลขบัญชี" />
          </label>
          <label>
            <span>ประเภทบัญชี</span>
            <select name="account_type" defaultValue="ธนาคาร">
              <option>ธนาคาร</option>
              <option>เครื่องฝาก</option>
              <option>เครื่องถอน</option>
              <option>PromptPay</option>
            </select>
          </label>
          <button type="submit" disabled={saving === "bank_account"}>
            <Plus size={16} />
            <span>{saving === "bank_account" ? "กำลังเพิ่ม..." : "เพิ่มบัญชี"}</span>
          </button>
        </div>
      </form>

      <form className="panel form-box settings-card" onSubmit={(event) => submit(event, "crypto_account")}>
        <div className="panel-header">
          <div>
            <h2><Bitcoin size={18} /> เพิ่มบัญชีคริปโต</h2>
            <p>เก็บ wallet address และ network สำหรับทีมแอดมิน</p>
          </div>
        </div>
        <div className="form-body settings-form-body settings-add-form">
          <label>
            <span>ชื่อบัญชี</span>
            <input name="name" placeholder="ระบุชื่อบัญชี" required />
          </label>
          <label>
            <span>Address</span>
            <input name="address" placeholder="Wallet address" />
          </label>
          <label>
            <span>Network</span>
            <input name="network" placeholder="เช่น TRC20, ERC20" />
          </label>
          <button type="submit" disabled={saving === "crypto_account"}>
            <Plus size={16} />
            <span>{saving === "crypto_account" ? "กำลังเพิ่ม..." : "เพิ่มบัญชีคริปโต"}</span>
          </button>
        </div>
      </form>

      <form className="panel form-box settings-card" onSubmit={(event) => submit(event, "app_user")}>
        <div className="panel-header">
          <div>
            <h2><UserPlus size={18} /> เพิ่มผู้ใช้งานระบบ</h2>
            <p>สร้างบัญชี admin/user ในตาราง app_users</p>
          </div>
        </div>
        <div className="form-body settings-form-body settings-add-form">
          <label>
            <span>Username</span>
            <input name="username" placeholder="ระบุชื่อผู้ใช้งาน" required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" name="password" placeholder="ระบุรหัสผ่าน" />
          </label>
          <label>
            <span>Role</span>
            <select name="role" defaultValue="admin">
              <option value="admin">admin</option>
              <option value="user">user</option>
              <option value="viewer">viewer</option>
            </select>
          </label>
          <button type="submit" disabled={saving === "app_user"}>
            <Plus size={16} />
            <span>{saving === "app_user" ? "กำลังเพิ่ม..." : "เพิ่มผู้ใช้งาน"}</span>
          </button>
        </div>
      </form>

      {status.message ? (
        <div className={`msg ${status.type === "ok" ? "msg-success" : "msg-error"} settings-message`} role="status">
          {status.type === "ok" ? <CheckCircle2 size={16} /> : <TriangleAlert size={16} />}
          <span>{status.message}</span>
        </div>
      ) : null}
    </section>
  );
}
