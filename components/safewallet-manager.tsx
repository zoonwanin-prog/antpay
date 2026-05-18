"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, Pencil, RotateCcw, Save, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { TablePagination } from "@/components/table-pagination";
import type { JsonRecord } from "@/lib/types";

type SafeWalletForm = {
  date: string;
  time: string;
  accountName: string;
  amountThb: string;
  feePercent: string;
  feeAmount: string;
  netThb: string;
  userName: string;
  source_ref: string;
};

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function emptyForm(date: string): SafeWalletForm {
  return { date, time: "", accountName: "", amountThb: "", feePercent: "", feeAmount: "", netThb: "", userName: "auto", source_ref: "" };
}

function text(value: unknown) {
  return String(value || "");
}

function formatThaiDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function SafeWalletManager({
  rows: initialRows,
  summaryRows: initialSummaryRows,
  monthRows: initialMonthRows,
  date,
  page,
  pageCount,
  totalRows
}: {
  rows: JsonRecord[];
  summaryRows: JsonRecord[];
  monthRows: JsonRecord[];
  date: string;
  page: number;
  pageCount: number;
  totalRows: number;
}) {
  const [rows, setRows] = useState<JsonRecord[]>(initialRows);
  const [summaryRows, setSummaryRows] = useState<JsonRecord[]>(initialSummaryRows);
  const [monthRows, setMonthRows] = useState<JsonRecord[]>(initialMonthRows);
  const [currentTotalRows, setCurrentTotalRows] = useState(totalRows);
  const [form, setForm] = useState<SafeWalletForm>(() => emptyForm(date));
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"" | "ok" | "err">("");
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => {
    const dayAmount = summaryRows.reduce((sum, row) => sum + safeAmount(row), 0);
    const monthAmount = monthRows.reduce((sum, row) => sum + safeAmount(row), 0);
    const dayFee = summaryRows.reduce((sum, row) => sum + safeFee(row), 0);
    const monthFee = monthRows.reduce((sum, row) => sum + safeFee(row), 0);
    const dayNet = summaryRows.reduce((sum, row) => sum + safeNet(row), 0);
    const monthNet = monthRows.reduce((sum, row) => sum + safeNet(row), 0);
    return { dayAmount, monthAmount, dayFee, monthFee, dayNet, monthNet };
  }, [summaryRows, monthRows]);

  function updateField(name: keyof SafeWalletForm, value: string) {
    setForm((current) => calculateForm({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setStatus("");
    const sourceRef = form.source_ref || `manual-safewallet:${Date.now()}`;
    const calculated = calculateForm(form);
    const payload = {
      table: "safewallet_transactions",
      source_ref: sourceRef,
      date: calculated.date,
      time: calculated.time || null,
      account_name: calculated.accountName || null,
      merchant: calculated.accountName || null,
      amount: Number(calculated.amountThb || 0),
      amount_thb: Number(calculated.amountThb || 0),
      fee_percent: Number(calculated.feePercent || 0),
      fee_amount: Number(calculated.feeAmount || 0),
      net_thb: Number(calculated.netThb || 0),
      user_name: calculated.userName || "auto",
      status: "approved",
      note: null,
      created_at_source: null
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
      accountName: accountName(row),
      amountThb: text(row.amount_thb || row.amount),
      feePercent: text(normalizeFeePercent(row.fee_percent)),
      feeAmount: text(row.fee_amount),
      netThb: text(row.net_thb || safeNet(row)),
      userName: text(row.user_name) || "auto",
      source_ref: text(row.source_ref)
    });
    setMessage("");
    setStatus("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteRow(row: JsonRecord) {
    const id = text(row.id);
    if (!id || !window.confirm("ลบรายการ SafeWallet นี้ใช่ไหม?")) return;
    setMessage("");
    setStatus("");
    try {
      const res = await fetch("/api/entries", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ table: "safewallet_transactions", id })
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
        <div className="card metric-card compact-card transfer-summary-card safewallet-month-summary">
          <p className="metric">SafeWallet เดือนนี้ ({date.slice(5, 7)}/{date.slice(0, 4)})</p>
          <div className="safewallet-inline-total">
            <span>NET <strong>{money.format(totals.monthNet)}</strong> บาท</span>
            <span>ค่าธรรมเนียม <strong>{money.format(totals.monthFee)}</strong> บาท</span>
          </div>
        </div>
        <div className="card metric-card compact-card transfer-summary-card">
          <p className="metric">SafeWallet วันนี้ ({formatThaiDate(date)})</p>
          <p className="value">{money.format(totals.dayAmount)} บาท</p>
        </div>
        <div className="card metric-card compact-card balance-summary-card is-purple">
          <p className="metric">ค่าธรรมเนียมวันนี้ ({formatThaiDate(date)})</p>
          <p className="value">{money.format(totals.dayFee)} บาท</p>
        </div>
      </section>

      <section className="transfer-form-heading">
        <span aria-hidden="true"><ShieldCheck size={23} /></span>
        <h2>{editingId ? "แก้ไข SafeWallet" : "บันทึก SafeWallet"}</h2>
      </section>

      <section className="panel form-box transfer-form-panel">
        <div className="form-body">
          <form onSubmit={submit} className="form-grid igrid safewallet-form-grid">
            <label><span>วันที่</span><input type="date" value={form.date} onChange={(event) => updateField("date", event.target.value)} required /></label>
            <label><span>เวลา</span><input type="time" value={form.time} onChange={(event) => updateField("time", event.target.value)} /></label>
            <label><span>ชื่อบัญชี</span><input value={form.accountName} placeholder="ระบุชื่อบัญชี" onChange={(event) => updateField("accountName", event.target.value)} required /></label>
            <label><span>AMOUNT (THB)</span><input value={form.amountThb} placeholder="0.00" inputMode="decimal" onChange={(event) => updateField("amountThb", event.target.value)} required /></label>
            <label><span>FEE%</span><input value={form.feePercent} placeholder="0.00" inputMode="decimal" onChange={(event) => updateField("feePercent", event.target.value)} /></label>
            <label><span>ค่าธรรมเนียม</span><input value={form.feeAmount} placeholder="0.00" inputMode="decimal" readOnly /></label>
            <label className="safewallet-net-field"><span>NET (THB)</span><input value={form.netThb} placeholder="0.00" inputMode="decimal" readOnly /></label>
            <div className="form-actions safewallet-actions">
              <button type="submit" disabled={saving} className="btn-primary-submit"><Save size={17} /><span>{saving ? "กำลังบันทึก..." : editingId ? "ยืนยันแก้ไขบันทึกรายการ" : "บันทึกรายการ"}</span></button>
              {editingId ? <button type="button" className="btn-secondary" onClick={resetForm}><RotateCcw size={16} /><span>ยกเลิกแก้ไข</span></button> : null}
            </div>
          </form>
          {message ? <StatusMessage status={status} message={message} /> : null}
        </div>
      </section>

      <SafeWalletTable rows={rows} date={date} page={page} pageCount={pageCount} totalRows={currentTotalRows} onEdit={startEdit} onDelete={deleteRow} />
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

function toNumber(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizeFeePercent(value: unknown) {
  const number = toNumber(value);
  if (number > 0 && number <= 1) return number * 100;
  return number;
}

function fixed2(value: number) {
  return value ? value.toFixed(2) : "";
}

function calculateForm(form: SafeWalletForm): SafeWalletForm {
  const amount = toNumber(form.amountThb);
  const feePercent = toNumber(form.feePercent);
  const feeAmount = amount * feePercent / 100;
  return {
    ...form,
    feeAmount: fixed2(feeAmount),
    netThb: fixed2(amount - feeAmount)
  };
}

function accountName(row: JsonRecord) {
  return text(row.account_name || row.merchant);
}

function safeAmount(row: JsonRecord) {
  return toNumber(row.amount_thb || row.amount);
}

function safeFee(row: JsonRecord) {
  const savedFee = toNumber(row.fee_amount);
  if (savedFee) return savedFee;
  return safeAmount(row) * normalizeFeePercent(row.fee_percent) / 100;
}

function safeNet(row: JsonRecord) {
  const savedNet = toNumber(row.net_thb);
  if (savedNet) return savedNet;
  return safeAmount(row) - safeFee(row);
}

function StatusMessage({ status, message }: { status: "" | "ok" | "err"; message: string }) {
  return (
    <div className={`msg ${status === "ok" ? "msg-success" : "msg-error"}`} role="status">
      {status === "ok" ? <CheckCircle2 size={16} /> : <TriangleAlert size={16} />}
      <span>{message}</span>
    </div>
  );
}

function SafeWalletTable({ rows, date, page, pageCount, totalRows, onEdit, onDelete }: { rows: JsonRecord[]; date: string; page: number; pageCount: number; totalRows: number; onEdit: (row: JsonRecord) => void; onDelete: (row: JsonRecord) => void }) {
  return (
    <section className="panel data-list-panel is-stack">
      <div className="panel-header"><div><h2>รายการ SafeWallet</h2><p>รายการทั้งหมด เรียงจากล่าสุดไปเก่า</p></div></div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>วันที่</th>
              <th>เวลา</th>
              <th>ชื่อบัญชี</th>
              <th className="num">AMOUNT (THB)</th>
              <th className="num">FEE%</th>
              <th className="num">ค่าธรรมเนียม</th>
              <th className="num">NET (THB)</th>
              <th>ผู้ทำรายการ</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={9}><div className="empty-state">ยังไม่มีรายการ SafeWallet</div></td></tr> : rows.map((row) => (
              <tr key={text(row.id) || text(row.source_ref) || `${row.date}-${row.created_at}`}>
                <td>{text(row.date).slice(0, 10)}</td>
                <td>{text(row.time).slice(0, 5) || "-"}</td>
                <td>{accountName(row) || "-"}</td>
                <td className="num">{money.format(safeAmount(row))}</td>
                <td className="num">{normalizeFeePercent(row.fee_percent).toFixed(2)}</td>
                <td className="num">{money.format(safeFee(row))}</td>
                <td className="num">{money.format(safeNet(row))}</td>
                <td>{text(row.user_name) || "-"}</td>
                <td><div className="table-actions"><button type="button" className="btn-edit" onClick={() => onEdit(row)} aria-label="แก้ไขรายการ"><Pencil size={15} /></button><button type="button" className="btn-del" onClick={() => onDelete(row)} aria-label="ลบรายการ"><Trash2 size={15} /></button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination basePath="/safewallet" date={date} page={page} pageCount={pageCount} totalRows={totalRows} />
    </section>
  );
}
