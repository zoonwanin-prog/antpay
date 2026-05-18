"use client";

import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Bitcoin, CheckCircle2, CloudUpload, ImagePlus, Pencil, RotateCcw, Save, Trash2, TriangleAlert } from "lucide-react";
import type { JsonRecord } from "@/lib/types";
import { TablePagination } from "@/components/table-pagination";
import { uploadFileToDrive } from "@/lib/google-drive-client";

type MasterOption = { id?: string; name?: string; username?: string; account_no?: string; address?: string };

type CryptoForm = {
  date: string;
  time: string;
  source_account: string;
  status: string;
  target_account: string;
  amount_thb: string;
  exchange_rate: string;
  usdt: string;
  user_name: string;
  note: string;
  slip_url: string;
};

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdtFormat = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statusOptions = ["ซื้อ USDT", "ถอน USDT", "โอน USDT", "ขาย USDT"];

function emptyForm(date: string): CryptoForm {
  return {
    date,
    time: "",
    source_account: "",
    status: "ซื้อ USDT",
    target_account: "",
    amount_thb: "",
    exchange_rate: "",
    usdt: "",
    user_name: "admin",
    note: "",
    slip_url: ""
  };
}

function text(value: unknown) {
  return String(value || "");
}

function optionLabel(option: MasterOption) {
  const name = option.name || option.username || "";
  const suffix = option.account_no || option.address || "";
  return suffix ? `${name} · ${suffix}` : name;
}

function optionValue(option: MasterOption) {
  return option.name || option.username || "";
}

function signedUsdt(row: JsonRecord) {
  const usdt = Number(row.usdt || 0);
  return row.status === "ซื้อ USDT" ? usdt : -usdt;
}

function signedThb(row: JsonRecord) {
  const thb = Number(row.amount_thb || 0);
  return row.status === "ซื้อ USDT" ? thb : -thb;
}

export function CryptoManager({
  rows: initialRows,
  summaryRows: initialSummaryRows,
  throughRows,
  date,
  page,
  pageCount,
  totalRows,
  bankAccounts,
  cryptoAccounts,
  users
}: {
  rows: JsonRecord[];
  summaryRows: JsonRecord[];
  throughRows: JsonRecord[];
  date: string;
  page: number;
  pageCount: number;
  totalRows: number;
  bankAccounts: MasterOption[];
  cryptoAccounts: MasterOption[];
  users: MasterOption[];
}) {
  const [rows, setRows] = useState<JsonRecord[]>(initialRows);
  const [summaryRows, setSummaryRows] = useState<JsonRecord[]>(initialSummaryRows);
  const [allRows, setAllRows] = useState<JsonRecord[]>(throughRows);
  const [currentTotalRows, setCurrentTotalRows] = useState(totalRows);
  const [form, setForm] = useState<CryptoForm>(() => emptyForm(date));
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"" | "ok" | "err">("");
  const [saving, setSaving] = useState(false);
  const [uploadingSlip, setUploadingSlip] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const computedUsdt = useMemo(() => {
    const amount = Number(form.amount_thb || 0);
    const rate = Number(form.exchange_rate || 0);
    return rate > 0 ? amount / rate : 0;
  }, [form.amount_thb, form.exchange_rate]);

  const totals = useMemo(() => {
    const dayTotals = summaryRows.reduce<{
      buyUsdt: number;
      buyThb: number;
      withdrawUsdt: number;
      withdrawThb: number;
      transferUsdt: number;
      transferThb: number;
    }>(
      (sum, row) => {
        const usdt = Number(row.usdt || 0);
        const thb = Number(row.amount_thb || 0);
        if (row.status === "ซื้อ USDT") {
          sum.buyUsdt += usdt;
          sum.buyThb += thb;
        } else if (row.status === "ถอน USDT") {
          sum.withdrawUsdt += usdt;
          sum.withdrawThb += thb;
        } else if (row.status === "โอน USDT") {
          sum.transferUsdt += usdt;
          sum.transferThb += thb;
        }
        return sum;
      },
      { buyUsdt: 0, buyThb: 0, withdrawUsdt: 0, withdrawThb: 0, transferUsdt: 0, transferThb: 0 }
    );
    const balance = allRows.reduce<{ usdt: number; thb: number }>(
      (sum, row) => {
        sum.usdt += signedUsdt(row);
        sum.thb += signedThb(row);
        return sum;
      },
      { usdt: 0, thb: 0 }
    );
    return { ...dayTotals, balanceUsdt: balance.usdt, balanceThb: balance.thb };
  }, [summaryRows, allRows]);

  function updateField(name: keyof CryptoForm, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("err");
      setMessage("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
      event.target.value = "";
      return;
    }
    setUploadingSlip(true);
    setStatus("");
    setMessage("กำลังอัปโหลดสลิปเข้า Google Drive...");
    try {
      const result = await uploadFileToDrive(file, {
        folderType: "slip",
        uploadedBy: form.user_name || "admin",
        relatedTable: "crypto_transactions"
      });
      updateField("slip_url", result.drive_url);
      setStatus("ok");
      setMessage(`แนบสลิปจาก Google Drive สำเร็จ: ${result.file_name}`);
    } catch (error) {
      setStatus("err");
      setMessage(error instanceof Error ? error.message : "แนบรูปไม่สำเร็จ");
      event.target.value = "";
    } finally {
      setUploadingSlip(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setStatus("");
    const usdt = Number(form.usdt || 0) || computedUsdt;
    const payload = {
      table: "crypto_transactions",
      date: form.date,
      time: form.time || null,
      source_account: form.source_account || null,
      status: form.status,
      target_account: form.target_account || null,
      amount_thb: Number(form.amount_thb || 0),
      exchange_rate: Number(form.exchange_rate || 0),
      usdt,
      user_name: form.user_name || "admin",
      note: form.note || null,
      slip_url: form.slip_url || null
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
      setAllRows((current) => (editingId ? current.map((row) => (row.id === editingId ? json.row : row)) : [...current, json.row]));
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
      source_account: text(row.source_account),
      status: text(row.status) || "ซื้อ USDT",
      target_account: text(row.target_account),
      amount_thb: text(row.amount_thb),
      exchange_rate: text(row.exchange_rate),
      usdt: text(row.usdt),
      user_name: text(row.user_name) || "admin",
      note: text(row.note),
      slip_url: text(row.slip_url)
    });
    setMessage("");
    setStatus("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteRow(row: JsonRecord) {
    const id = text(row.id);
    if (!id || !window.confirm("ลบรายการคริปโตนี้ใช่ไหม?")) return;
    setMessage("");
    setStatus("");
    try {
      const res = await fetch("/api/entries", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ table: "crypto_transactions", id })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "ลบไม่สำเร็จ");
      setRows((current) => current.filter((item) => item.id !== id));
      setCurrentTotalRows((current) => Math.max(0, current - 1));
      setSummaryRows((current) => current.filter((item) => item.id !== id));
      setAllRows((current) => current.filter((item) => item.id !== id));
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
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="section-stack">
      <section className="grid compact-card-grid crypto-summary-grid">
        <CryptoCard tone="good" label={`ซื้อ USDT (${formatThaiDate(date)})`} usdt={totals.buyUsdt} thb={totals.buyThb} />
        <CryptoCard tone="bad" label={`ถอน USDT (${formatThaiDate(date)})`} usdt={totals.withdrawUsdt} thb={totals.withdrawThb} />
        <CryptoCard tone="blue" label={`โอน USDT (${formatThaiDate(date)})`} usdt={totals.transferUsdt} thb={totals.transferThb} />
        <CryptoCard tone="purple" label="คงเหลือ USDT สะสมถึงวันที่เลือก" usdt={totals.balanceUsdt} thb={totals.balanceThb} hint={`รวมทุกรายการจนถึง ${formatThaiDate(date)}`} />
      </section>

      <section className="transfer-form-heading">
        <span aria-hidden="true"><Bitcoin size={23} /></span>
        <h2>{editingId ? "แก้ไขธุรกรรมคริปโต" : "ธุรกรรมคริปโต"}</h2>
      </section>

      <section className="panel form-box transfer-form-panel">
        <div className="form-body">
          <form onSubmit={submit} className="crypto-form-grid">
            <label className="field-compact crypto-field-date">
              <span>วันที่</span>
              <input type="date" name="date" value={form.date} onChange={(event) => updateField("date", event.target.value)} required />
            </label>
            <label className="field-compact crypto-field-time">
              <span>เวลา</span>
              <input type="time" name="time" value={form.time} onChange={(event) => updateField("time", event.target.value)} />
            </label>
            <label className="crypto-field-account">
              <span>บัญชีต้นทาง</span>
              <OptionSelect name="source_account" value={form.source_account} placeholder="เลือกบัญชีต้นทาง" options={bankAccounts} onChange={updateField} />
            </label>
            <label className="crypto-field-status">
              <span>สถานะ</span>
              <select name="status" value={form.status} onChange={(event) => updateField("status", event.target.value)} required>
                {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="crypto-field-account">
              <span>บัญชีปลายทาง</span>
              <OptionSelect name="target_account" value={form.target_account} placeholder="เลือกบัญชีปลายทาง" options={cryptoAccounts} onChange={updateField} />
            </label>
            <label className="crypto-field-money">
              <span>จำนวน (บาท)</span>
              <input name="amount_thb" placeholder="0.00" inputMode="decimal" value={form.amount_thb} onChange={(event) => updateField("amount_thb", event.target.value)} required />
            </label>
            <label className="crypto-field-rate">
              <span>อัตราแลกเปลี่ยน</span>
              <input name="exchange_rate" placeholder="0.00" inputMode="decimal" value={form.exchange_rate} onChange={(event) => updateField("exchange_rate", event.target.value)} />
            </label>
            <label className="crypto-field-usdt">
              <span>USDT</span>
              <input name="usdt" placeholder={computedUsdt ? computedUsdt.toFixed(2) : "0.00"} inputMode="decimal" value={form.usdt} onChange={(event) => updateField("usdt", event.target.value)} />
            </label>
            <label className="crypto-field-user">
              <span>ผู้บันทึก</span>
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
              <input name="note" placeholder="หมายเหตุ (ถ้ามี)" value={form.note} onChange={(event) => updateField("note", event.target.value)} />
            </label>
            <label className="wide-field transfer-attachment-field">
              <span><CloudUpload size={14} /> แนบรูป (อัปโหลดเข้า Google Drive)</span>
              <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} disabled={uploadingSlip} />
              {uploadingSlip ? <small>กำลังอัปโหลดเข้า Drive...</small> : null}
              {form.slip_url ? (
                <div className="attachment-preview">
                  {form.slip_url.startsWith("data:") || form.slip_url.endsWith(".jpg") || form.slip_url.endsWith(".png") ? (
                    <img src={form.slip_url} alt="รูปแนบรายการคริปโต" />
                  ) : (
                    <a href={form.slip_url} target="_blank" rel="noreferrer" className="btn-ghost">
                      <ImagePlus size={15} /> เปิดดูสลิปบน Google Drive
                    </a>
                  )}
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      updateField("slip_url", "");
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                  >
                    ลบรูปแนบ
                  </button>
                </div>
              ) : null}
            </label>
            <div className="form-actions wide-field">
              <button type="submit" disabled={saving || uploadingSlip} className="btn-primary-submit">
                <Save size={17} />
                <span>
                  {saving
                    ? "กำลังบันทึก..."
                    : uploadingSlip
                      ? "รอ Drive อัปโหลด..."
                      : editingId
                        ? "ยืนยันแก้ไขบันทึกรายการ"
                        : "บันทึกรายการ"}
                </span>
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

      <CryptoTable rows={rows} date={date} page={page} pageCount={pageCount} totalRows={currentTotalRows} onEdit={startEdit} onDelete={deleteRow} />
    </div>
  );
}

function CryptoCard({ tone, label, usdt, thb, hint }: { tone: string; label: string; usdt: number; thb: number; hint?: string }) {
  return (
    <div className={`card metric-card compact-card crypto-summary-card is-${tone}`}>
      <p className="metric">{label}</p>
      <p className="value">{usdtFormat.format(usdt)}</p>
      <p className="crypto-card-thb">= {money.format(thb)} บาท</p>
      {hint ? <p className="metric-hint">{hint}</p> : null}
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
  name: keyof CryptoForm;
  value: string;
  placeholder: string;
  options: MasterOption[];
  onChange: (name: keyof CryptoForm, value: string) => void;
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

function CryptoTable({
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
          <h2>รายการคริปโต</h2>
          <p>รายการทั้งหมด เรียงจากล่าสุดไปเก่า</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>วันที่</th>
              <th>เวลา</th>
              <th>สถานะ</th>
              <th>บัญชีต้นทาง</th>
              <th>บัญชีปลายทาง</th>
              <th className="num">THB</th>
              <th className="num">Rate</th>
              <th className="num">USDT</th>
              <th>รูป</th>
              <th>ผู้บันทึก</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11}>
                  <div className="empty-state">ยังไม่มีรายการคริปโต</div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={text(row.id) || `${row.date}-${row.created_at}`}>
                  <td>{text(row.date).slice(0, 10)}</td>
                  <td>{text(row.time).slice(0, 5) || "-"}</td>
                  <td>{text(row.status) || "-"}</td>
                  <td>{text(row.source_account) || "-"}</td>
                  <td>{text(row.target_account) || "-"}</td>
                  <td className="num">{money.format(Number(row.amount_thb || 0))}</td>
                  <td className="num">{Number(row.exchange_rate || 0).toFixed(2)}</td>
                  <td className="num">{usdtFormat.format(Number(row.usdt || 0))}</td>
                  <td>{row.slip_url ? <a className="table-image-link" href={text(row.slip_url)} target="_blank" rel="noreferrer"><ImagePlus size={15} /> ดูรูป</a> : "-"}</td>
                  <td>{text(row.user_name) || "-"}</td>
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
      <TablePagination basePath="/crypto" date={date} page={page} pageCount={pageCount} totalRows={totalRows} />
    </section>
  );
}

function formatThaiDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
