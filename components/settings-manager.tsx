"use client";

import { useState } from "react";
import { Building2, Coins, Pencil, Save, Trash2, User, X } from "lucide-react";
import type { JsonRecord } from "@/lib/types";

type Config = {
  kind: "bank_account" | "crypto_account" | "app_user";
  title: string;
  description: string;
  className: string;
  fields: { key: string; label: string; type?: string; options?: string[]; placeholder?: string }[];
};

const configs: Config[] = [
  {
    kind: "bank_account",
    title: "บัญชีธนาคาร",
    description: "แก้ไข master data จากตาราง bank_accounts",
    className: "is-bank",
    fields: [
      { key: "bank", label: "ธนาคาร", options: ["SCB", "KTB", "KBANK", "BBL", "TTB", "BAY", "GSB", "อื่นๆ"] },
      { key: "name", label: "ชื่อบัญชี" },
      { key: "display_name", label: "ชื่อแสดงผล" },
      { key: "account_no", label: "เลขบัญชี" },
      { key: "account_type", label: "ประเภท", options: ["ธนาคาร", "เครื่องฝาก", "เครื่องถอน", "PromptPay"] }
    ]
  },
  {
    kind: "crypto_account",
    title: "บัญชีคริปโต",
    description: "แก้ไข wallet address และ network",
    className: "is-crypto",
    fields: [
      { key: "name", label: "ชื่อบัญชี" },
      { key: "address", label: "Address" },
      { key: "network", label: "Network" }
    ]
  },
  {
    kind: "app_user",
    title: "ผู้ใช้งาน",
    description: "แก้ไข role หรือ reset password จากตาราง app_users",
    className: "is-users",
    fields: [
      { key: "username", label: "Username" },
      { key: "role", label: "Role", options: ["admin", "user", "viewer"] },
      { key: "password", label: "Password ใหม่", type: "password", placeholder: "เว้นว่างถ้าไม่เปลี่ยน" }
    ]
  }
];

function value(row: JsonRecord, key: string) {
  return String(row[key] || "");
}

function rowTitle(config: Config, row: JsonRecord) {
  if (config.kind === "app_user") return value(row, "username") || "-";
  return value(row, "name") || "-";
}

function rowMeta(config: Config, row: JsonRecord) {
  if (config.kind === "bank_account") {
    const accountNo = value(row, "account_no");
    const accountType = value(row, "account_type");
    const bank = value(row, "bank");
    return [bank ? bank : "", accountNo ? `[${accountNo}]` : "", accountType ? `(${accountType})` : ""].filter(Boolean).join(" ");
  }
  if (config.kind === "crypto_account") {
    const address = value(row, "address");
    const network = value(row, "network");
    return [address ? `[${address}]` : "", network ? `(${network})` : ""].filter(Boolean).join(" ");
  }
  const password = value(row, "password");
  const role = value(row, "role");
  return [password ? `[${password}]` : "", role ? `(${role})` : ""].filter(Boolean).join(" ");
}

function RowIcon({ kind }: { kind: Config["kind"] }) {
  if (kind === "bank_account") return <Building2 size={19} />;
  if (kind === "crypto_account") return <Coins size={19} />;
  return <User size={19} />;
}

async function mutate(method: "PATCH" | "DELETE", body: Record<string, unknown>) {
  const res = await fetch("/api/settings", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || "บันทึกไม่สำเร็จ");
  return json;
}

function EditablePanel({ config, rows: initialRows }: { config: Config; rows: JsonRecord[] }) {
  const [rows, setRows] = useState<JsonRecord[]>(initialRows);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [editingId, setEditingId] = useState("");

  async function save(form: HTMLFormElement) {
    const payload = Object.fromEntries(new FormData(form).entries());
    setBusy(String(payload.id));
    setMessage("");
    try {
      const json = await mutate("PATCH", { kind: config.kind, ...payload });
      setRows((current) => current.map((row) => (value(row, "id") === String(payload.id) ? json.row : row)));
      setMessage("บันทึกสำเร็จ");
      setEditingId("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("ยืนยันลบรายการนี้?")) return;
    setBusy(id);
    setMessage("");
    try {
      await mutate("DELETE", { kind: config.kind, id });
      setRows((current) => current.filter((row) => value(row, "id") !== id));
      setMessage("ลบสำเร็จ");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ลบไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="panel settings-list-panel">
      <div className="panel-header">
        <div>
          <h2>{config.title} ({rows.length})</h2>
          <p>{config.description}</p>
        </div>
      </div>
      <div className="settings-edit-list">
        {rows.length === 0 ? (
          <div className="empty-state">ยังไม่มีข้อมูล</div>
        ) : (
          rows.map((row) => {
            const id = value(row, "id");
            const isEditing = editingId === id;
            return (
              <div key={id} className={`settings-list-item${isEditing ? " is-editing" : ""}`}>
                <span className="settings-list-icon" aria-hidden="true">
                  <RowIcon kind={config.kind} />
                </span>
                <div className="settings-list-copy">
                  <strong>{rowTitle(config, row)}</strong>
                  {rowMeta(config, row) ? <span>{rowMeta(config, row)}</span> : null}
                </div>
                <div className="settings-row-actions">
                  <button type="button" className="btn-edit" disabled={busy === id} onClick={() => setEditingId(id)} aria-label="แก้ไขรายการ">
                    <Pencil size={15} />
                  </button>
                  <button type="button" className="btn-del" disabled={busy === id} onClick={() => remove(id)} aria-label="ลบรายการ">
                    <Trash2 size={15} />
                  </button>
                </div>
                {isEditing ? (
                  <form className={`settings-edit-form ${config.className}`} onSubmit={(event) => event.preventDefault()}>
                    <input type="hidden" name="id" value={id} />
                    {config.fields.map((field) => (
                      <label key={field.key}>
                        <span>{field.label}</span>
                        {field.options ? (
                          <select name={field.key} defaultValue={value(row, field.key)}>
                            {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                        ) : (
                          <input
                            name={field.key}
                            type={field.type || "text"}
                            defaultValue={field.key === "password" ? "" : value(row, field.key)}
                            placeholder={field.placeholder}
                          />
                        )}
                      </label>
                    ))}
                    <div className="settings-row-actions">
                      <button type="button" className="btn-save-row" disabled={busy === id} onClick={(event) => save(event.currentTarget.form!)}>
                        <Save size={15} />
                        <span>บันทึก</span>
                      </button>
                      <button type="button" className="btn-secondary" disabled={busy === id} onClick={() => setEditingId("")}>
                        <X size={15} />
                        <span>ยกเลิก</span>
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      {message ? <div className="msg msg-info settings-inline-message">{message}</div> : null}
    </section>
  );
}

export function SettingsManager({
  users,
  bankAccounts,
  cryptoAccounts
}: {
  users: JsonRecord[];
  bankAccounts: JsonRecord[];
  cryptoAccounts: JsonRecord[];
}) {
  const rowsByKind = {
    app_user: users,
    bank_account: bankAccounts,
    crypto_account: cryptoAccounts
  };
  return (
    <section className="settings-list-grid">
      {configs.map((config) => (
        <EditablePanel key={config.kind} config={config} rows={rowsByKind[config.kind]} />
      ))}
    </section>
  );
}
