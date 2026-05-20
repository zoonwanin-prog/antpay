"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, Pencil, RotateCcw, Save, Trash2, TriangleAlert, WalletCards } from "lucide-react";
import type { JsonRecord } from "@/lib/types";
import { TablePagination } from "@/components/table-pagination";

type MasterOption = { id?: string; name?: string; username?: string; account_no?: string };

type BalanceForm = {
  date: string;
  time: string;
  account_name: string;
  balance_type: string;
  amount: string;
  user_name: string;
  note: string;
};

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const balanceTypes = ["ระบบ", "ธนาคาร", "บัญชีฝาก", "บัญชีถอน"];

function emptyForm(date: string): BalanceForm {
  return {
    date,
    time: "",
    account_name: "",
    balance_type: "ระบบ",
    amount: "",
    user_name: "admin",
    note: ""
  };
}

function text(value: unknown) {
  return String(value || "");
}

function optionLabel(option: MasterOption) {
  const name = option.name || option.username || "";
  const suffix = option.account_no || "";
  return suffix ? `${name} · ${suffix}` : name;
}

function optionValue(option: MasterOption) {
  return option.name || option.username || "";
}

export function BalancesManager({
  rows: initialRows,
  summaryRows: initialSummaryRows,
  date,
  page,
  pageCount,
  totalRows,
  bankAccounts,
  users
}: {
  rows: JsonRecord[];
  summaryRows: JsonRecord[];
  date: string;
  page: number;
  pageCount: number;
  totalRows: number;
  bankAccounts: MasterOption[];
  users: MasterOption[];
}) {
  const [rows, setRows] = useState<JsonRecord[]>(initialRows);
  const [summaryRows, setSummaryRows] = useState<JsonRecord[]>(initialSummaryRows);
  const [currentTotalRows, setCurrentTotalRows] = useState(totalRows);
  const [form, setForm] = useState<BalanceForm>(() => emptyForm(date));
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"" | "ok" | "err">("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRows(initialRows);
    setSummaryRows(initialSummaryRows);
    setCurrentTotalRows(totalRows);
    setEditingId("");
    setForm(emptyForm(date));
  }, [initialRows, initialSummaryRows, totalRows, date]);

  const totals = useMemo(() => {
    return summaryRows.reduce<{ system: number; bank: number; systemItems: JsonRecord[]; bankItems: JsonRecord[] }>(
      (sum, row) => {
        const amount = Number(row.amount || 0);
        const type = text(row.balance_type);
        if (type === "ระบบ") {
          if (isMainOrPayout(row)) sum.system += amount;
          sum.systemItems.push(row);
        }
        if (type === "ธนาคาร" || type === "บัญชีฝาก" || type === "บัญชีถอน") {
          sum.bank += amount;
          sum.bankItems.push(row);
        }
        return sum;
      },
      { system: 0, bank: 0, systemItems: [], bankItems: [] }
    );
  }, [summaryRows]);

  function updateField(name: keyof BalanceForm, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setStatus("");
    const payload = {
      table: "balances",
      date: form.date,
      time: form.time || null,
      account_name: form.account_name || "ไม่ระบุ",
      balance_type: form.balance_type,
      amount: Number(form.amount || 0),
      user_name: form.user_name || "admin",
      note: form.note || null
    };
    try {
      const res = await fetch("/api/entries", {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editingId ? { ...payload, id: editingId } : payload)
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "บันทึกไม่สำเร็จ");
      setRows((current) => (editingId ? current.map((row) => (row.id === editingId ? json.row : row)) : page === 1 ? [json.row, ...current].slice(0, 20) : current));
      if (!editingId) setCurrentTotalRows((current) => current + 1);
      setSummaryRows((current) => {
        const nextRow = json.row as JsonRecord;
        const nextDate = text(nextRow.date).slice(0, 10);
        if (editingId) {
          const withoutOld = current.filter((row) => row.id !== editingId);
          return nextDate === date ? [nextRow, ...withoutOld] : withoutOld;
        }
        return nextDate === date ? [nextRow, ...current] : current;
      });
      setStatus("ok");
      setMessage(editingId ? "แก้ไขรายการสำเร็จ" : "บันทึกรายการสำเร็จ");
      resetForm();
    } catch (error) {
      setStatus("err");
      setMessage(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: JsonRecord) {
    setEditingId(text(row.id));
    setForm({
      date: text(row.date).slice(0, 10) || date,
      time: text(row.time).slice(0, 5),
      account_name: text(row.account_name),
      balance_type: text(row.balance_type) || "ระบบ",
      amount: text(row.amount),
      user_name: text(row.user_name) || "admin",
      note: text(row.note)
    });
    setMessage("");
    setStatus("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteRow(row: JsonRecord) {
    const id = text(row.id);
    if (!id || !window.confirm("ลบรายการยอดคงเหลือนี้ใช่ไหม?")) return;
    setMessage("");
    setStatus("");
    try {
      const res = await fetch("/api/entries", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ table: "balances", id })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "ลบไม่สำเร็จ");
      setRows((current) => current.filter((item) => item.id !== id));
      setCurrentTotalRows((current) => Math.max(0, current - 1));
      setSummaryRows((current) => current.filter((item) => item.id !== id));
      if (editingId === id) resetForm();
      setStatus("ok");
      setMessage("ลบรายการสำเร็จ");
    } catch (error) {
      setStatus("err");
      setMessage(error instanceof Error ? error.message : "ลบไม่สำเร็จ");
    }
  }

  function resetForm() {
    setEditingId("");
    setForm(emptyForm(date));
  }

  return (
    <div className="section-stack">
      <section className="grid compact-card-grid balance-summary-grid">
        <BalanceCard label={`ยอดระบบ (${formatThaiDate(date)})`} value={totals.system} rows={totals.systemItems} tone="purple" />
        <BalanceCard label={`ยอดธนาคาร (${formatThaiDate(date)})`} value={totals.bank} rows={totals.bankItems} tone="blue" />
      </section>

      <section className="transfer-form-heading">
        <span aria-hidden="true"><WalletCards size={23} /></span>
        <h2>{editingId ? "แก้ไขยอดคงเหลือ" : "อัปเดตยอดคงเหลือ"}</h2>
      </section>

      <section className="panel form-box transfer-form-panel">
        <div className="form-body">
          <form onSubmit={submit} className="balance-form-grid">
            <label className="balance-field-date">
              <span>วันที่</span>
              <input type="date" name="date" value={form.date} onChange={(event) => updateField("date", event.target.value)} required />
            </label>
            <label className="balance-field-time">
              <span>เวลา</span>
              <input type="time" name="time" value={form.time} onChange={(event) => updateField("time", event.target.value)} />
            </label>
            <label className="balance-field-account">
              <span>จากบัญชี</span>
              <OptionSelect name="account_name" value={form.account_name} placeholder="เลือกบัญชี" options={bankAccounts} onChange={updateField} />
            </label>
            <label className="balance-field-type">
              <span>ประเภท</span>
              <select name="balance_type" value={form.balance_type} onChange={(event) => updateField("balance_type", event.target.value)} required>
                {balanceTypes.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="balance-field-amount">
              <span>จำนวนเงิน</span>
              <input name="amount" placeholder="0.00" inputMode="decimal" value={form.amount} onChange={(event) => updateField("amount", event.target.value)} required />
            </label>
            <label className="balance-field-user">
              <span>ผู้ทำรายการ</span>
              <OptionSelect
                name="user_name"
                value={form.user_name}
                placeholder="admin"
                options={users.map((user) => ({ ...user, name: user.username || user.name }))}
                onChange={updateField}
              />
            </label>
            <label className="wide-field">
              <span>หมายเหตุ</span>
              <textarea name="note" placeholder="หมายเหตุ (ถ้ามี)" value={form.note} onChange={(event) => updateField("note", event.target.value)} />
            </label>
            <div className="form-actions wide-field">
              <button type="submit" disabled={saving} className="btn-primary-submit">
                <Save size={17} />
                <span>{saving ? "กำลังบันทึก..." : editingId ? "ยืนยันแก้ไขบันทึกรายการ" : "บันทึกรายการ"}</span>
              </button>
              {editingId ? (
                <button type="button" className="btn-secondary" onClick={resetForm}>
                  <RotateCcw size={16} />
                  <span>ยกเลิกแก้ไข</span>
                </button>
              ) : null}
            </div>
          </form>
          {message ? (
            <div className={`msg ${status === "ok" ? "msg-success" : "msg-error"}`} role="status">
              {status === "ok" ? <CheckCircle2 size={16} /> : <TriangleAlert size={16} />}
              <span>{message}</span>
            </div>
          ) : null}
        </div>
      </section>

      <BalanceTable rows={rows} date={date} page={page} pageCount={pageCount} totalRows={currentTotalRows} onEdit={startEdit} onDelete={deleteRow} />
    </div>
  );
}

function BalanceCard({ label, value, rows, tone }: { label: string; value: number; rows: JsonRecord[]; tone: "purple" | "blue" }) {
  return (
    <div className={`card metric-card compact-card balance-summary-card is-${tone}`}>
      <p className="metric">{label}</p>
      <p className="value">{money.format(value)}</p>
      {rows.length ? (
        <div className="balance-card-detail">
          {rows.map((row) => (
            <div key={text(row.id) || `${row.account_name}-${row.balance_type}`}>
              <span>{text(row.account_name) || "-"}</span>
              <strong>{formatBalanceAmount(row)}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function OptionSelect({
  name,
  value,
  placeholder,
  options,
  onChange
}: {
  name: keyof BalanceForm;
  value: string;
  placeholder: string;
  options: MasterOption[];
  onChange: (name: keyof BalanceForm, value: string) => void;
}) {
  if (!options.length) {
    return <input name={name} value={value} placeholder={placeholder} onChange={(event) => onChange(name, event.target.value)} />;
  }
  return (
    <select name={name} value={value} onChange={(event) => onChange(name, event.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.id || optionValue(option)} value={optionValue(option)}>
          {optionLabel(option)}
        </option>
      ))}
    </select>
  );
}

function normalizeName(value: unknown) {
  return text(value).replace(/\s+/g, "").toLowerCase();
}

function isMainOrPayout(row: JsonRecord) {
  const name = normalizeName(row.account_name);
  return name === "main" || name === "payout";
}

function formatBalanceAmount(row: JsonRecord) {
  const amount = money.format(Number(row.amount || 0));
  return normalizeName(row.account_name) === "safewallet" ? `${amount} USDT` : amount;
}

function BalanceTable({
  rows,
  date,
  page,
  pageCount,
  totalRows,
  onEdit,
  onDelete
}: {
  rows: JsonRecord[];
  date: string;
  page: number;
  pageCount: number;
  totalRows: number;
  onEdit: (row: JsonRecord) => void;
  onDelete: (row: JsonRecord) => void;
}) {
  return (
    <section className="panel data-list-panel is-stack">
      <div className="panel-header">
        <div>
          <h2>รายการยอดคงเหลือ</h2>
          <p>รายการทั้งหมด เรียงจากล่าสุดไปเก่า</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>วันที่</th>
              <th>เวลา</th>
              <th>จากบัญชี</th>
              <th>ประเภท</th>
              <th className="num">จำนวนเงิน</th>
              <th>ผู้ทำรายการ</th>
              <th>หมายเหตุ</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">ยังไม่มีรายการยอดคงเหลือ</div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={text(row.id) || `${row.date}-${row.account_name}-${row.balance_type}`}>
                  <td>{text(row.date).slice(0, 10)}</td>
                  <td>{text(row.time).slice(0, 5) || "-"}</td>
                  <td>{text(row.account_name) || "-"}</td>
                  <td>{text(row.balance_type) || "-"}</td>
                  <td className="num">{money.format(Number(row.amount || 0))}</td>
                  <td>{text(row.user_name) || "-"}</td>
                  <td>{text(row.note) || "-"}</td>
                  <td>
                    <div className="table-actions">
                      <button type="button" className="btn-edit" onClick={() => onEdit(row)} aria-label="แก้ไขรายการ">
                        <Pencil size={15} />
                      </button>
                      <button type="button" className="btn-del" onClick={() => onDelete(row)} aria-label="ลบรายการ">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <TablePagination basePath="/balances" date={date} page={page} pageCount={pageCount} totalRows={totalRows} />
    </section>
  );
}

function formatThaiDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
