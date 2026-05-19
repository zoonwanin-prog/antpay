"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { CloudUpload, ExternalLink, FileSearch, ListFilter, RotateCcw, Search } from "lucide-react";

type Row = Record<string, unknown>;
type UploadType = "statement" | "payout_time";
type StatementToolsMode = "upload" | "all" | "statement-search" | "bulk-status";
type BankAccount = {
  id: string;
  bank: string;
  account_no: string;
  name: string;
  account_name: string;
  display_name: string;
};
type ImportHistoryRow = {
  import_id: string;
  import_type: string;
  source_file_name: string;
  source_file_url: string;
  uploaded_by: string;
  uploaded_at: string;
  record_count: number;
  inserted_count: number;
  skipped_count: number;
};
type ImportResult = {
  import_id: string;
  import_type: string;
  file_name: string;
  record_count: number;
  processed_count: number;
  inserted_count: number;
  skipped_count: number;
  warnings?: string[];
  errors?: string[];
  synced_months?: string[];
  preview?: Row[];
};
type UploadProgress = {
  type: UploadType;
  percent: number;
  label: string;
  startedAt: number;
  elapsedMs: number;
};
type BulkSummary = {
  pending_count: number;
  pending_amount: string;
  paid_count: number;
  paid_amount: string;
  followup_pending_count: number;
  followup_pending_amount: string;
  total_amount: string;
};
type SearchMeta = {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  require_search?: boolean;
  summary?: BulkSummary;
};

function text(row: Row, key: string) {
  const value = row[key];
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export function StatementTools({ month, mode = "all" }: { month: string; mode?: StatementToolsMode }) {
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploading, setUploading] = useState("");
  const [searchMessage, setSearchMessage] = useState("");
  const [statementRows, setStatementRows] = useState<Row[]>([]);
  const [bulkRows, setBulkRows] = useState<Row[]>([]);
  const [statementImports, setStatementImports] = useState<ImportHistoryRow[]>([]);
  const [payoutImports, setPayoutImports] = useState<ImportHistoryRow[]>([]);
  const [searching, setSearching] = useState("");
  const [rollingBack, setRollingBack] = useState("");
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [statementAccountId, setStatementAccountId] = useState("");
  const [payoutSourceAccountId, setPayoutSourceAccountId] = useState("");
  const [lastImport, setLastImport] = useState<ImportResult | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [statementMeta, setStatementMeta] = useState<SearchMeta | null>(null);
  const [bulkMeta, setBulkMeta] = useState<SearchMeta | null>(null);
  const [bulkSearchParams, setBulkSearchParams] = useState<URLSearchParams | null>(null);
  const [updatingFollowup, setUpdatingFollowup] = useState("");

  const showUploads = mode === "all" || mode === "upload";
  const showStatementSearch = mode === "all" || mode === "statement-search";
  const showBulkSearch = mode === "all" || mode === "bulk-status";

  useEffect(() => {
    if (showUploads) {
      void loadImports("statement").catch((error) => setUploadMessage(error instanceof Error ? error.message : "โหลดประวัติ import ไม่สำเร็จ"));
      void loadImports("payout_time").catch((error) => setUploadMessage(error instanceof Error ? error.message : "โหลดประวัติ import ไม่สำเร็จ"));
    }
    if (showUploads || showStatementSearch || showBulkSearch) {
      void loadBankAccounts().catch((error) => setUploadMessage(error instanceof Error ? error.message : "โหลดบัญชีธนาคารไม่สำเร็จ"));
    }
  }, [mode]);

  useEffect(() => {
    if (!uploadProgress) return;
    const timer = window.setInterval(() => {
      setUploadProgress((current) => current ? { ...current, elapsedMs: Date.now() - current.startedAt } : current);
    }, 500);
    return () => window.clearInterval(timer);
  }, [uploadProgress?.startedAt]);

  async function loadImports(type: UploadType) {
    const params = new URLSearchParams({ type, limit: "8" });
    const res = await fetch(`/api/statement-tools/imports?${params.toString()}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "โหลดประวัติ import ไม่สำเร็จ");
    if (type === "statement") setStatementImports(json.rows || []);
    else setPayoutImports(json.rows || []);
  }

  async function loadBankAccounts() {
    const res = await fetch("/api/statement-tools/upload?accounts=1");
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "โหลดบัญชีธนาคารไม่สำเร็จ");
    setBankAccounts(json.rows || []);
  }

  async function upload(event: FormEvent<HTMLFormElement>, type: UploadType) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("type", type);
    setUploading(type);
    setUploadMessage("");
    setLastImport(null);
    const startedAt = Date.now();
    setUploadProgress({ type, percent: 1, label: "เตรียมอัปโหลด", startedAt, elapsedMs: 0 });
    try {
      const json = await uploadWithProgress(data, (percent, label) => {
        setUploadProgress({ type, percent, label, startedAt, elapsedMs: Date.now() - startedAt });
      });
      if (!json.success) throw new Error(json.message || "อัปโหลดไม่สำเร็จ");
      const result = json.import as ImportResult | undefined;
      if (result) {
        setLastImport(result);
        setUploadMessage(json.warning || `Import สำเร็จ: เพิ่ม ${result.inserted_count} แถว, ข้ามซ้ำ ${result.skipped_count} แถว`);
      } else {
        setUploadMessage(json.warning || `อัปโหลดไฟล์ ${type} สำเร็จ`);
      }
      setUploadProgress({ type, percent: 100, label: "เสร็จสมบูรณ์", startedAt, elapsedMs: Date.now() - startedAt });
      form.reset();
      await loadImports(type);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "อัปโหลดไม่สำเร็จ");
      setUploadProgress((current) => current ? { ...current, label: "อัปโหลดไม่สำเร็จ" } : current);
    } finally {
      setUploading("");
      window.setTimeout(() => setUploadProgress(null), 1600);
    }
  }

  async function rollback(row: ImportHistoryRow) {
    const label = row.source_file_name || row.import_id;
    if (!window.confirm(`Rollback import นี้?\n${label}`)) return;
    setRollingBack(row.import_id);
    setUploadMessage("");
    setLastImport(null);
    try {
      const res = await fetch("/api/statement-tools/imports", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ import_id: row.import_id, actor: "admin" })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Rollback ไม่สำเร็จ");
      setUploadMessage(`Rollback สำเร็จ: ลบ ${json.deleted || 0} แถว`);
      await loadImports(row.import_type === "statement" ? "statement" : "payout_time");
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "Rollback ไม่สำเร็จ");
    } finally {
      setRollingBack("");
    }
  }

  async function search(event: FormEvent<HTMLFormElement>, type: UploadType) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const date = String(form.get("date") || "");
    if (type === "statement" && !date) {
      setStatementRows([]);
      setStatementMeta({ total: 0, page: 1, page_size: 0, total_pages: 1, require_search: true });
      setSearchMessage("กรุณาเลือกวันที่ก่อนค้นหา Statement");
      return;
    }
    const params = new URLSearchParams();
    params.set("type", type);
    params.set("q", String(form.get("q") || ""));
    params.set("month", String(form.get("month") || month));
    params.set("date", date);
    params.set("account_id", String(form.get("account_id") || ""));
    params.set("status", String(form.get("status") || ""));
    params.set("reporter", String(form.get("reporter") || ""));
    params.set("all", "1");
    if (type === "payout_time") setBulkSearchParams(params);
    await runSearch(type, params, 1);
  }

  async function runSearch(type: UploadType, params: URLSearchParams, page = 1) {
    setSearching(type);
    setSearchMessage("");
    try {
      params.set("page", String(page));
      const res = await fetch(`/api/statement-tools/search?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "ค้นหาไม่สำเร็จ");
      if (type === "statement") {
        setStatementRows(json.rows || []);
        setStatementMeta(json);
      } else {
        setBulkRows(json.rows || []);
        setBulkMeta(json);
      }
      const total = Number(json.total ?? (json.rows || []).length);
      setSearchMessage(json.message || (json.require_search ? "กรุณาเลือกวันที่ก่อนค้นหา Statement" : `พบผลลัพธ์ ${total} รายการ`));
    } catch (error) {
      setSearchMessage(error instanceof Error ? error.message : "ค้นหาไม่สำเร็จ");
    } finally {
      setSearching("");
    }
  }

  async function updateFollowup(row: Row, paid: boolean) {
    const itemId = String(row.payout_item_id || row.id || "");
    if (!itemId) return;
    setUpdatingFollowup(itemId);
    setSearchMessage("");
    try {
      const res = await fetch("/api/payout-followups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, paid, user: "admin" })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "บันทึก follow up ไม่สำเร็จ");
      setBulkRows((rows) => rows.map((item) => {
        const currentId = String(item.payout_item_id || item.id || "");
        return currentId === itemId ? { ...item, followup_paid: paid, followup_status: paid ? "paid" : "pending" } : item;
      }));
      if (bulkSearchParams) await runSearch("payout_time", new URLSearchParams(bulkSearchParams), bulkMeta?.page || 1);
    } catch (error) {
      setSearchMessage(error instanceof Error ? error.message : "บันทึก follow up ไม่สำเร็จ");
    } finally {
      setUpdatingFollowup("");
    }
  }

  async function openDriveFile(url: string) {
    if (!url) return;
    const password = window.prompt("กรอกรหัสผ่านก่อนเปิดไฟล์ Google Drive");
    if (password === null) return;
    const popup = window.open("about:blank", "_blank", "noopener,noreferrer");
    try {
      const res = await fetch("/api/statement-tools/drive-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "verify", password })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "รหัสผ่านไม่ถูกต้อง");
      if (popup) popup.location.href = url;
      else window.location.href = url;
    } catch (error) {
      if (popup) popup.close();
      setUploadMessage(error instanceof Error ? error.message : "เปิดไฟล์ไม่สำเร็จ");
    }
  }

  return (
    <section className="panel statement-tools-panel is-stack">
      <div className="panel-header">
        <div>
          <h2><CloudUpload size={18} /> {modeTitle(mode)}</h2>
          <p>{modeDescription(mode)}</p>
        </div>
      </div>
      {showUploads ? (
        <>
          <div className="statement-tools-grid">
            <form className="tool-card" onSubmit={(event) => upload(event, "statement")}>
              <h3><CloudUpload size={17} /> อัปโหลด Statement</h3>
              <select name="account_id" value={statementAccountId} onChange={(event) => setStatementAccountId(event.target.value)} required>
                <option value="">เลือกบัญชี statement</option>
                {bankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {accountLabel(account)}
                  </option>
                ))}
              </select>
              <input type="file" name="file" accept=".csv" required />
              <button type="submit" disabled={uploading === "statement"}>{uploading === "statement" ? "กำลังอัปโหลดและ import..." : "Upload และ import statement"}</button>
            </form>
            <form className="tool-card" onSubmit={(event) => upload(event, "payout_time")}>
              <h3><CloudUpload size={17} /> อัปโหลด Payout Time / Bulk</h3>
              <select name="payout_source_account_id" value={payoutSourceAccountId} onChange={(event) => setPayoutSourceAccountId(event.target.value)} required>
                <option value="">เลือกบัญชีต้นทาง payout</option>
                {bankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {accountLabel(account)}
                  </option>
                ))}
              </select>
              <input type="file" name="file" accept=".csv" required />
              <button type="submit" disabled={uploading === "payout_time"}>{uploading === "payout_time" ? "กำลังอัปโหลดและ import..." : "Upload และ import payout"}</button>
            </form>
          </div>
          {uploadProgress ? <UploadProgressBar progress={uploadProgress} /> : null}
          {uploadMessage ? <div className="msg msg-info statement-tool-message">{uploadMessage}</div> : null}
          {lastImport ? <ImportSummary result={lastImport} /> : null}
          <div className="statement-tools-grid upload-history-grid">
            <ImportList title="ประวัติ Import Statement" rows={statementImports} rollingBack={rollingBack} onOpenDrive={openDriveFile} onRollback={rollback} />
            <ImportList title="ประวัติ Import Payout" rows={payoutImports} rollingBack={rollingBack} onOpenDrive={openDriveFile} onRollback={rollback} />
          </div>
        </>
      ) : null}

      {showStatementSearch || showBulkSearch ? (
        <div className={`statement-tools-grid search-tools-grid${mode !== "all" ? " is-single" : ""}`}>
          {showStatementSearch ? (
            <form className="tool-card statement-search-card" onSubmit={(event) => search(event, "statement")}>
              <h3><FileSearch size={17} /> ค้นหาจาก Statement</h3>
              <div className="tool-alert">
                <strong>ใช้ค้นหาประวัติฝากย้อนหลัง</strong>
                <span>ค้นจาก description, เลขบัญชี, ยอดเงิน, reference หรือชื่อไฟล์ โดยต้องเลือกวันที่ก่อนค้นหา</span>
              </div>
              <div className="tool-filter-grid statement-filter-grid">
                <input name="q" placeholder="ค้น description / เลขบัญชี / ยอดเงิน / reference" />
                <input type="date" name="date" aria-label="เลือกวันที่" required />
                <input type="month" name="month" defaultValue={month} aria-label="เลือกเดือน" />
                <select name="account_id" defaultValue="">
                  <option value="">ทุกบัญชี</option>
                  {bankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>{accountLabel(account)}</option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={searching === "statement"}><Search size={15} /> ค้นหา statement</button>
              <SearchCount meta={statementMeta} shown={statementRows.length} />
              <ResultTable type="statement" rows={statementRows} />
            </form>
          ) : null}
          {showBulkSearch ? (
            <form className="tool-card bulk-search-card" onSubmit={(event) => search(event, "payout_time")}>
              <h3><ListFilter size={17} /> ค้นหาสถานะรายการ Bulk</h3>
              <div className="tool-filter-grid bulk-filter-grid">
                <select name="status" defaultValue="failed">
                  <option value="">ทุกสถานะ</option>
                  <option value="failed">โอนไม่สำเร็จ</option>
                  <option value="success">โอนสำเร็จ</option>
                  <option value="pending">รอดำเนินการ</option>
                </select>
                <input type="date" name="date" aria-label="เลือกวันที่" />
                <input type="month" name="month" defaultValue={month} aria-label="เลือกเดือน" />
                <select name="account_id" defaultValue="">
                  <option value="">ทุกบัญชี</option>
                  {bankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>{accountLabel(account)}</option>
                  ))}
                </select>
                <input name="reporter" placeholder="ผู้แจ้งทั้งหมด" />
                <input name="q" placeholder="ค้นชื่อ / บัญชี / ธนาคาร / ยอด / Ref" />
              </div>
              <button type="submit" disabled={searching === "payout_time"}><Search size={15} /> ค้นหา bulk</button>
              <BulkSummary meta={bulkMeta} />
              <SearchCount meta={bulkMeta} shown={bulkRows.length} />
              <ResultTable type="payout_time" rows={bulkRows} updatingFollowup={updatingFollowup} onFollowup={updateFollowup} />
              <Pagination meta={bulkMeta} disabled={searching === "payout_time"} onPage={(page) => {
                if (bulkSearchParams) void runSearch("payout_time", new URLSearchParams(bulkSearchParams), page);
              }} />
            </form>
          ) : null}
        </div>
      ) : null}
      {searchMessage ? <div className="msg msg-info statement-tool-message">{searchMessage}</div> : null}
    </section>
  );
}

function uploadWithProgress(data: FormData, onProgress: (percent: number, label: string) => void): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/statement-tools/upload");
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        onProgress(12, "กำลังส่งไฟล์");
        return;
      }
      const uploadPercent = Math.round((event.loaded / event.total) * 70);
      onProgress(Math.min(70, Math.max(2, uploadPercent)), "กำลังส่งไฟล์");
    };
    xhr.upload.onload = () => onProgress(72, "ตรวจไฟล์และเช็คเลขบัญชี");
    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
        onProgress(86, "อัปโหลดเข้า Drive และ import เข้า Supabase");
      }
    };
    xhr.onload = () => {
      let json: Record<string, any> = {};
      try {
        json = JSON.parse(xhr.responseText || "{}");
      } catch {
        reject(new Error("อ่านผลลัพธ์จาก server ไม่สำเร็จ"));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100, "เสร็จสมบูรณ์");
        resolve(json);
      } else {
        reject(new Error(String(json.message || `อัปโหลดไม่สำเร็จ (HTTP ${xhr.status})`)));
      }
    };
    xhr.onerror = () => reject(new Error("เชื่อมต่อ server ไม่สำเร็จ"));
    xhr.ontimeout = () => reject(new Error("อัปโหลดใช้เวลานานเกินไป"));
    xhr.timeout = 10 * 60 * 1000;
    xhr.send(data);
  });
}

function UploadProgressBar({ progress }: { progress: UploadProgress }) {
  return (
    <div className="upload-progress-card">
      <div className="upload-progress-meta">
        <strong>{progress.percent}%</strong>
        <span>{progress.label}</span>
        <small>{formatElapsed(progress.elapsedMs)}</small>
      </div>
      <div className="upload-progress-track" aria-label="upload progress">
        <span style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }} />
      </div>
    </div>
  );
}

function modeTitle(mode: StatementToolsMode) {
  if (mode === "upload") return "อัปโหลด Statement";
  if (mode === "statement-search") return "ค้นหาจาก Statement";
  if (mode === "bulk-status") return "ค้นหาสถานะรายการ Bulk";
  return "Google Drive / Statement tools";
}

function modeDescription(mode: StatementToolsMode) {
  if (mode === "upload") return "อัปโหลดไฟล์ statement และ payout_time เข้า Google Drive พร้อมดูไฟล์ล่าสุด";
  if (mode === "statement-search") return "ค้นหายอด statement รายวันตามเดือน ธนาคาร หรือเลขบัญชี";
  if (mode === "bulk-status") return "ค้นหา id ผู้รับ เลขบัญชี หรือสถานะรายการ bulk payout";
  return "อัปโหลดไฟล์ statement และ payout_time พร้อมค้นหา statement หรือรายการ bulk";
}

function ImportList({
  title,
  rows,
  rollingBack,
  onOpenDrive,
  onRollback
}: {
  title: string;
  rows: ImportHistoryRow[];
  rollingBack: string;
  onOpenDrive: (url: string) => void;
  onRollback: (row: ImportHistoryRow) => void;
}) {
  return (
    <div className="tool-card upload-history-card">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <div className="tool-empty">ยังไม่มีประวัติ import</div>
      ) : (
        <div className="upload-list">
          {rows.map((row) => (
            <div className="upload-item import-history-item" key={row.import_id}>
              <button
                type="button"
                className={`drive-protected-link${!row.source_file_url ? " is-disabled" : ""}`}
                disabled={!row.source_file_url}
                onClick={() => onOpenDrive(row.source_file_url)}
              >
                <span>
                  <strong>{row.source_file_name || row.import_id}</strong>
                  <small>{formatDate(row.uploaded_at)} · เพิ่ม {row.inserted_count || 0} · ซ้ำ {row.skipped_count || 0}</small>
                </span>
                {row.source_file_url ? <ExternalLink size={15} aria-hidden="true" /> : null}
              </button>
              <button type="button" className="rollback-button" disabled={rollingBack === row.import_id} onClick={() => onRollback(row)}>
                <RotateCcw size={15} />
                <span>{rollingBack === row.import_id ? "กำลัง rollback..." : "Rollback"}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ImportSummary({ result }: { result: ImportResult }) {
  return (
    <div className="tool-card import-summary-card">
      <h3>ผล Import ล่าสุด</h3>
      <div className="import-summary-grid">
        <span><strong>{result.record_count}</strong><small>แถวทั้งหมด</small></span>
        <span><strong>{result.inserted_count}</strong><small>เพิ่มใหม่</small></span>
        <span><strong>{result.skipped_count}</strong><small>ข้ามซ้ำ</small></span>
        <span><strong>{result.import_id}</strong><small>import id</small></span>
      </div>
      {result.synced_months?.length ? <p className="tool-note">Sync summary: {result.synced_months.join(", ")}</p> : null}
      {result.warnings?.length ? (
        <div className="import-warnings">
          {result.warnings.slice(0, 8).map((warning) => <span key={warning}>{warning}</span>)}
        </div>
      ) : null}
    </div>
  );
}

function SearchCount({ meta, shown }: { meta: SearchMeta | null; shown: number }) {
  if (!meta) return null;
  if (meta.require_search) return <div className="tool-empty">กรุณาเลือกวันที่ก่อนค้นหา Statement</div>;
  return <div className="tool-note">พบ {meta.total ?? shown} รายการ{meta.total > shown ? ` | แสดง ${shown} รายการแรก` : ""}</div>;
}

function BulkSummary({ meta }: { meta: SearchMeta | null }) {
  const summary = meta?.summary;
  if (!summary) return null;
  return (
    <div className="bulk-summary-row">
      <span>รอดำเนินการ: <strong>{summary.pending_count} รายการ</strong></span>
      <span>ยอดรอโอนรวม: <strong className="is-red">{summary.pending_amount}</strong></span>
      <span>โอนตามแล้ว: <strong className="is-green">{summary.paid_count} รายการ / {summary.paid_amount}</strong></span>
      <span>ค้างโอนตาม: <strong className="is-red">{summary.followup_pending_count} รายการ / {summary.followup_pending_amount}</strong></span>
      <span>ยอดรวมทั้งหมด: <strong>{summary.total_amount}</strong></span>
    </div>
  );
}

function Pagination({ meta, disabled, onPage }: { meta: SearchMeta | null; disabled: boolean; onPage: (page: number) => void }) {
  if (!meta || !meta.total || meta.total_pages <= 1) return null;
  return (
    <div className="tool-pagination">
      <span>หน้า {meta.page} จาก {meta.total_pages}</span>
      <div>
        <button type="button" disabled={disabled || meta.page <= 1} onClick={() => onPage(meta.page - 1)}>ก่อนหน้า</button>
        <button type="button" disabled={disabled || meta.page >= meta.total_pages} onClick={() => onPage(meta.page + 1)}>ถัดไป</button>
      </div>
    </div>
  );
}

function ResultTable({
  type,
  rows,
  updatingFollowup = "",
  onFollowup
}: {
  type: UploadType;
  rows: Row[];
  updatingFollowup?: string;
  onFollowup?: (row: Row, paid: boolean) => void;
}) {
  if (!rows.length) return <div className="tool-empty">ยังไม่มีผลลัพธ์</div>;
  if (type === "statement") return (
    <div className="table-wrap tool-results">
      <table>
        <thead>
          <tr>
            <th>วันที่</th>
            <th>เวลา</th>
            <th>ธนาคาร</th>
            <th>บัญชีระบบ</th>
            <th>ชื่อ/รายละเอียด</th>
            <th className="num">ฝาก</th>
            <th className="num">ถอน</th>
            <th className="num">Fee</th>
            <th className="num">ยอด</th>
            <th>Ref</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${String(row.id || "statement")}-${index}`}>
              <td>{formatDisplayDate(text(row, "transaction_date"))}</td>
              <td>{text(row, "transaction_time")}</td>
              <td>{text(row, "bank")}</td>
              <td>{text(row, "account_no")}</td>
              <td className="statement-description">{text(row, "name_or_description")}</td>
              <td className="num is-green">{text(row, "deposit_text")}</td>
              <td className="num is-red">{text(row, "withdrawal_text")}</td>
              <td className="num">{text(row, "fee_text")}</td>
              <td className="num">{text(row, "balance_text")}</td>
              <td>{text(row, "reference_no")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="table-wrap tool-results bulk-results">
      <table>
        <thead>
          <tr>
            <th>วันที่</th>
            <th>ลำดับ</th>
            <th>ชื่อ</th>
            <th>ธนาคาร</th>
            <th>เลขบัญชี</th>
            <th>ประเภท</th>
            <th className="num">ยอดเงิน</th>
            <th className="num">Fee</th>
            <th>Follow up</th>
            <th>เหตุผล</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const itemId = String(row.payout_item_id || row.id || `${type}-${index}`);
            const isPaid = Boolean(row.followup_paid);
            return (
              <tr key={itemId} className={isPaid ? "is-followup-paid" : "is-followup-pending"}>
                <td>{formatDisplayDate(text(row, "date"))}</td>
                <td>{text(row, "row_no")}</td>
                <td>{text(row, "recipient_name")}</td>
                <td>{text(row, "recipient_bank_name")}</td>
                <td>{text(row, "recipient_account_no")}</td>
                <td>{text(row, "payment_name")}</td>
                <td className="num">{text(row, "amount_text")}</td>
                <td className="num">{text(row, "fee_text")}</td>
                <td>
                  <span className={`followup-pill ${isPaid ? "is-paid" : "is-pending"}`}>{isPaid ? "โอนตามแล้ว" : "ค้างโอนตาม"}</span>
                  {onFollowup ? (
                    <button type="button" className="followup-action" disabled={updatingFollowup === itemId} onClick={() => onFollowup(row, !isPaid)}>
                      {isPaid ? "กลับเป็นค้างโอน" : "โอนตามแล้ว"}
                    </button>
                  ) : null}
                </td>
                <td className="statement-description">{text(row, "rejection_reason")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok"
  }).format(new Date(value));
}

function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes <= 0) return `${rest}s`;
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

function formatDisplayDate(value: string) {
  if (!value || value === "-") return "-";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function accountLabel(account: BankAccount) {
  const name = account.display_name || account.account_name || account.name || "ไม่ระบุชื่อบัญชี";
  const bank = account.bank || "ไม่ระบุธนาคาร";
  const accountNo = account.account_no || "ไม่ระบุเลขบัญชี";
  return `${bank} · ${accountNo} · ${name}`;
}
