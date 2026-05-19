"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { CheckCircle2, CloudUpload, ImagePlus, Pencil, RotateCcw, Save, Trash2, TriangleAlert } from "lucide-react";
import type { JsonRecord } from "@/lib/types";
import { TablePagination } from "@/components/table-pagination";
import { uploadFileToDrive } from "@/lib/google-drive-client";

type MasterOption = { id?: string; name?: string; username?: string; account_no?: string };

type TransferForm = {
  date: string;
  time: string;
  source_account: string;
  target_account: string;
  status: string;
  amount: string;
  fee: string;
  user_name: string;
  note: string;
  slip_url: string;
};

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const transferStatusOptions = ["โยกเงิน", "โอน Settlement", "โอนตามยอดerror", "เติมทุน", "คืนทุน", "อื่นๆ", "ฝากเงินสด", "ถอนเงินสด"];

function emptyForm(date: string): TransferForm {
  return {
    date,
    time: "",
    source_account: "",
    target_account: "",
    status: "โยกเงิน",
    amount: "",
    fee: "",
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
  const suffix = option.account_no || "";
  return suffix ? `${name} · ${suffix}` : name;
}

function accountValue(option: MasterOption) {
  return option.name || option.username || "";
}


export function TransfersManager({
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
  const [form, setForm] = useState<TransferForm>(() => emptyForm(date));
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"" | "ok" | "err">("");
  const [saving, setSaving] = useState(false);
  const [uploadingSlip, setUploadingSlip] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRows(initialRows);
    setSummaryRows(initialSummaryRows);
    setCurrentTotalRows(totalRows);
    setEditingId("");
    setForm(emptyForm(date));
  }, [initialRows, initialSummaryRows, totalRows, date]);

  const totals = useMemo(() => {
    return summaryRows.reduce<{ settlement: number; transfer: number }>(
      (sum, row) => {
        const amount = Number(row.amount || 0);
        if (row.status === "โอน Settlement") sum.settlement += amount;
        if (row.status === "โยกเงิน") sum.transfer += amount;
        return sum;
      },
      { settlement: 0, transfer: 0 }
    );
  }, [summaryRows]);

  function updateField(name: keyof TransferForm, value: string) {
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
        relatedTable: "transfers"
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
    const payload = {
      table: "transfers",
      date: form.date,
      time: form.time || null,
      source_account: form.source_account || null,
      target_account: form.target_account || null,
      status: form.status,
      amount: Number(form.amount || 0),
      fee: Number(form.fee || 0),
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
      setRows((current) => {
        if (!editingId) return page === 1 ? [json.row, ...current].slice(0, 20) : current;
        return current.map((row) => (row.id === editingId ? json.row : row));
      });
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
      source_account: text(row.source_account),
      target_account: text(row.target_account),
      status: text(row.status) || "โยกเงิน",
      amount: text(row.amount),
      fee: text(row.fee),
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
    if (!id || !window.confirm("ลบรายการโยกเงินนี้ใช่ไหม?")) return;
    setMessage("");
    setStatus("");
    try {
      const res = await fetch("/api/entries", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ table: "transfers", id })
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
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="section-stack">
      <section className="grid compact-card-grid transfer-summary-grid">
        <div className="card metric-card compact-card transfer-summary-card tone-warn">
          <p className="metric">โอน SETTLEMENT ({formatThaiDate(date)})</p>
          <p className="value">{money.format(totals.settlement)}</p>
        </div>
        <div className="card metric-card compact-card transfer-summary-card">
          <p className="metric">โยกเงิน ({formatThaiDate(date)})</p>
          <p className="value">{money.format(totals.transfer)}</p>
        </div>
      </section>

      <section className="transfer-form-heading">
        <span aria-hidden="true">↔</span>
        <h2>{editingId ? "แก้ไขโยกเงิน" : "บันทึกโยกเงิน"}</h2>
      </section>

      <section className="panel form-box transfer-form-panel">
        <div className="form-body">
          <form onSubmit={submit} className="transfer-form-grid">
            <label className="field-compact">
              <span>วันที่</span>
              <input type="date" name="date" value={form.date} onChange={(event) => updateField("date", event.target.value)} required />
            </label>
            <label className="field-compact">
              <span>เวลา</span>
              <input type="time" name="time" value={form.time} onChange={(event) => updateField("time", event.target.value)} />
            </label>
            <label>
              <span>บัญชีต้นทาง</span>
              <AccountSelect name="source_account" value={form.source_account} placeholder="เลือกบัญชีต้นทาง" options={bankAccounts} onChange={updateField} />
            </label>
            <label>
              <span>บัญชีปลายทาง</span>
              <AccountSelect name="target_account" value={form.target_account} placeholder="เลือกบัญชีปลายทาง" options={bankAccounts} onChange={updateField} />
            </label>
            <label>
              <span>สถานะ</span>
              <select name="status" value={form.status} onChange={(event) => updateField("status", event.target.value)} required>
                {transferStatusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label>
              <span>จำนวน</span>
              <input name="amount" placeholder="0.00" inputMode="decimal" value={form.amount} onChange={(event) => updateField("amount", event.target.value)} required />
            </label>
            <label>
              <span>ค่าธรรมเนียม</span>
              <input name="fee" placeholder="0" inputMode="decimal" value={form.fee} onChange={(event) => updateField("fee", event.target.value)} />
            </label>
            <label>
              <span>ผู้บันทึก</span>
              <AccountSelect
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
                  {/* Drive thumbnails require auth; rely on link preview instead */}
                  {form.slip_url.startsWith("data:") || form.slip_url.endsWith(".jpg") || form.slip_url.endsWith(".png") ? (
                    <img src={form.slip_url} alt="รูปแนบรายการโยกเงิน" />
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

      <TransferTable rows={rows} date={date} page={page} pageCount={pageCount} totalRows={currentTotalRows} onEdit={startEdit} onDelete={deleteRow} />
    </div>
  );
}

function AccountSelect({
  name,
  value,
  placeholder,
  options,
  onChange
}: {
  name: keyof TransferForm;
  value: string;
  placeholder: string;
  options: MasterOption[];
  onChange: (name: keyof TransferForm, value: string) => void;
}) {
  if (!options.length) {
    return <input name={name} value={value} placeholder={placeholder} onChange={(event) => onChange(name, event.target.value)} />;
  }
  return (
    <select name={name} value={value} onChange={(event) => onChange(name, event.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.id || accountValue(option)} value={accountValue(option)}>
          {optionLabel(option)}
        </option>
      ))}
    </select>
  );
}

function TransferTable({
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
          <h2>รายการโยกเงิน</h2>
          <p>รายการทั้งหมด เรียงจากล่าสุดไปเก่า</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>วันที่</th>
              <th>เวลา</th>
              <th>บัญชีต้นทาง</th>
              <th>สถานะ</th>
              <th>บัญชีปลายทาง</th>
              <th className="num">จำนวน</th>
              <th className="num">Fee</th>
              <th>รูป</th>
              <th>ผู้บันทึก</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10}>
                  <div className="empty-state">ยังไม่มีรายการโยกเงิน</div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={text(row.id) || `${row.date}-${row.created_at}`}>
                  <td>{text(row.date).slice(0, 10)}</td>
                  <td>{text(row.time).slice(0, 5) || "-"}</td>
                  <td>{text(row.source_account) || "-"}</td>
                  <td>{text(row.status) || "-"}</td>
                  <td>{text(row.target_account) || "-"}</td>
                  <td className="num">{money.format(Number(row.amount || 0))}</td>
                  <td className="num">{money.format(Number(row.fee || 0))}</td>
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
      <TablePagination basePath="/transfers" date={date} page={page} pageCount={pageCount} totalRows={totalRows} />
    </section>
  );
}

function formatThaiDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
