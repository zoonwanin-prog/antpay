"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, Pencil, ReceiptText, RotateCcw, Save, Trash2, TriangleAlert } from "lucide-react";
import { TablePagination } from "@/components/table-pagination";
import type { JsonRecord } from "@/lib/types";

type MasterOption = { id?: string; name?: string; username?: string };

type ExpenseForm = {
  date: string;
  time: string;
  item: string;
  amount: string;
  user_name: string;
  note: string;
};

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function emptyForm(date: string): ExpenseForm {
  return { date, time: "", item: "", amount: "", user_name: "admin", note: "" };
}

function text(value: unknown) {
  return String(value || "");
}

function optionValue(option: MasterOption) {
  return option.username || option.name || "";
}

function formatThaiDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function ExpensesManager({
  rows: initialRows,
  summaryRows: initialSummaryRows,
  monthRows: initialMonthRows,
  date,
  page,
  pageCount,
  totalRows,
  users
}: {
  rows: JsonRecord[];
  summaryRows: JsonRecord[];
  monthRows: JsonRecord[];
  date: string;
  page: number;
  pageCount: number;
  totalRows: number;
  users: MasterOption[];
}) {
  const [rows, setRows] = useState<JsonRecord[]>(initialRows);
  const [summaryRows, setSummaryRows] = useState<JsonRecord[]>(initialSummaryRows);
  const [monthRows, setMonthRows] = useState<JsonRecord[]>(initialMonthRows);
  const [currentTotalRows, setCurrentTotalRows] = useState(totalRows);
  const [form, setForm] = useState<ExpenseForm>(() => emptyForm(date));
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"" | "ok" | "err">("");
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => {
    const day = summaryRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const month = monthRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return { day, month };
  }, [summaryRows, monthRows]);

  function updateField(name: keyof ExpenseForm, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setStatus("");
    const payload = {
      table: "expenses",
      date: form.date,
      time: form.time || null,
      item: form.item || "รายจ่าย",
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
      const nextRow = json.row as JsonRecord;
      setRows((current) => (editingId ? current.map((row) => (row.id === editingId ? nextRow : row)) : page === 1 ? [nextRow, ...current].slice(0, 20) : current));
      if (!editingId) setCurrentTotalRows((current) => current + 1);
      setSummaryRows((current) => updateScopedRows(current, nextRow, editingId, text(nextRow.date).slice(0, 10) === date));
      setMonthRows((current) => updateScopedRows(current, nextRow, editingId, text(nextRow.date).slice(0, 7) === date.slice(0, 7)));
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
      item: text(row.item),
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
    if (!id || !window.confirm("ลบรายการรายจ่ายนี้ใช่ไหม?")) return;
    setMessage("");
    setStatus("");
    try {
      const res = await fetch("/api/entries", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ table: "expenses", id })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "ลบไม่สำเร็จ");
      setRows((current) => current.filter((item) => item.id !== id));
      setSummaryRows((current) => current.filter((item) => item.id !== id));
      setMonthRows((current) => current.filter((item) => item.id !== id));
      setCurrentTotalRows((current) => Math.max(0, current - 1));
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
      <section className="grid compact-card-grid transfer-summary-grid">
        <div className="card metric-card compact-card transfer-summary-card tone-warn">
          <p className="metric">รายจ่ายประจำวันนี้ ({formatThaiDate(date)})</p>
          <p className="value">{money.format(totals.day)}</p>
        </div>
        <div className="card metric-card compact-card transfer-summary-card">
          <p className="metric">รวมรายจ่ายทั้งเดือน ({date.slice(5, 7)}/{date.slice(0, 4)})</p>
          <p className="value">{money.format(totals.month)}</p>
        </div>
      </section>

      <section className="transfer-form-heading">
        <span aria-hidden="true"><ReceiptText size={23} /></span>
        <h2>{editingId ? "แก้ไขรายจ่าย" : "บันทึกรายจ่าย"}</h2>
      </section>

      <section className="panel form-box transfer-form-panel">
        <div className="form-body">
          <form onSubmit={submit} className="form-grid igrid">
            <label>
              <span>วันที่</span>
              <input type="date" value={form.date} onChange={(event) => updateField("date", event.target.value)} required />
            </label>
            <label>
              <span>เวลา</span>
              <input type="time" value={form.time} onChange={(event) => updateField("time", event.target.value)} />
            </label>
            <label>
              <span>รายการ</span>
              <input value={form.item} placeholder="ระบุรายการค่าใช้จ่าย" onChange={(event) => updateField("item", event.target.value)} required />
            </label>
            <label>
              <span>จำนวนเงิน</span>
              <input value={form.amount} placeholder="0.00" inputMode="decimal" onChange={(event) => updateField("amount", event.target.value)} required />
            </label>
            <label>
              <span>ผู้บันทึก</span>
              <UserSelect value={form.user_name} users={users} onChange={(value) => updateField("user_name", value)} />
            </label>
            <label className="wide-field">
              <span>หมายเหตุ</span>
              <textarea value={form.note} onChange={(event) => updateField("note", event.target.value)} />
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
          {message ? <StatusMessage status={status} message={message} /> : null}
        </div>
      </section>

      <ExpensesTable rows={rows} date={date} page={page} pageCount={pageCount} totalRows={currentTotalRows} onEdit={startEdit} onDelete={deleteRow} />
    </div>
  );
}

function updateScopedRows(current: JsonRecord[], nextRow: JsonRecord, editingId: string, keep: boolean) {
  if (editingId) {
    const withoutOld = current.filter((row) => row.id !== editingId);
    return keep ? [nextRow, ...withoutOld] : withoutOld;
  }
  return keep ? [nextRow, ...current] : current;
}

function UserSelect({ value, users, onChange }: { value: string; users: MasterOption[]; onChange: (value: string) => void }) {
  if (!users.length) return <input value={value} placeholder="admin" onChange={(event) => onChange(event.target.value)} />;
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">admin</option>
      {users.map((user) => (
        <option key={user.id || optionValue(user)} value={optionValue(user)}>
          {optionValue(user)}
        </option>
      ))}
    </select>
  );
}

function StatusMessage({ status, message }: { status: "" | "ok" | "err"; message: string }) {
  return (
    <div className={`msg ${status === "ok" ? "msg-success" : "msg-error"}`} role="status">
      {status === "ok" ? <CheckCircle2 size={16} /> : <TriangleAlert size={16} />}
      <span>{message}</span>
    </div>
  );
}

function ExpensesTable({
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
          <h2>รายการรายจ่าย</h2>
          <p>รายการทั้งหมด เรียงจากล่าสุดไปเก่า</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="expenses-table">
          <thead>
            <tr>
              <th>วันที่</th>
              <th>เวลา</th>
              <th>รายการ</th>
              <th className="num">จำนวนเงิน</th>
              <th>หมายเหตุ</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6}><div className="empty-state">ยังไม่มีรายการรายจ่าย</div></td>
              </tr>
            ) : rows.map((row) => (
              <tr key={text(row.id) || `${row.date}-${row.created_at}`}>
                <td>{text(row.date).slice(0, 10)}</td>
                <td>{text(row.time).slice(0, 5) || "-"}</td>
                <td>{text(row.item) || "-"}</td>
                <td className="num">{money.format(Number(row.amount || 0))}</td>
                <td>{text(row.note) || "-"}</td>
                <td>
                  <div className="table-actions">
                    <button type="button" className="btn-edit" onClick={() => onEdit(row)} aria-label="แก้ไขรายการ"><Pencil size={15} /></button>
                    <button type="button" className="btn-del" onClick={() => onDelete(row)} aria-label="ลบรายการ"><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination basePath="/expenses" date={date} page={page} pageCount={pageCount} totalRows={totalRows} />
    </section>
  );
}
