"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Plus, Trash2, TriangleAlert } from "lucide-react";
import type { WithdrawCarryoverDetail } from "@/lib/types";

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const reasonOptions = ["ธนาคารปิด", "โอนไม่ทันรอบ", "ธนาคารขัดข้อง", "รอตรวจสอบ", "อื่นๆ"];

function nextDay(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function emptyForm(date: string) {
  return {
    boDate: date,
    paidDate: nextDay(date),
    amount: "",
    reason: "ธนาคารปิด",
    note: ""
  };
}

export function AuditWithdrawCarryover({ date, items }: { date: string; items: WithdrawCarryoverDetail[] }) {
  const router = useRouter();
  const [form, setForm] = useState(() => emptyForm(date));
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"" | "ok" | "err">("");

  function updateField(name: keyof ReturnType<typeof emptyForm>, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setTone("");
    try {
      const res = await fetch("/api/withdraw-carryovers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form)
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "บันทึกยอดถอนข้ามวันไม่สำเร็จ");
      setForm(emptyForm(date));
      setTone("ok");
      setMessage("บันทึกยอดถอนข้ามวันสำเร็จ");
      router.refresh();
    } catch (error) {
      setTone("err");
      setMessage(error instanceof Error ? error.message : "บันทึกยอดถอนข้ามวันไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!id || !window.confirm("ลบยอดถอนข้ามวันนี้ใช่ไหม?")) return;
    setDeletingId(id);
    setMessage("");
    setTone("");
    try {
      const res = await fetch(`/api/withdraw-carryovers?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "ลบไม่สำเร็จ");
      setTone("ok");
      setMessage("ลบยอดถอนข้ามวันสำเร็จ");
      router.refresh();
    } catch (error) {
      setTone("err");
      setMessage(error instanceof Error ? error.message : "ลบไม่สำเร็จ");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="audit-carryover-box">
      <form className="audit-carryover-form" onSubmit={submit}>
        <label>
          <span>วันที่ BO</span>
          <input type="date" value={form.boDate} onChange={(event) => updateField("boDate", event.target.value)} required />
        </label>
        <label>
          <span>วันที่โอนจริง</span>
          <input type="date" value={form.paidDate} onChange={(event) => updateField("paidDate", event.target.value)} required />
        </label>
        <label>
          <span>จำนวนเงิน</span>
          <input inputMode="decimal" placeholder="0.00" value={form.amount} onChange={(event) => updateField("amount", event.target.value)} required />
        </label>
        <label>
          <span>เหตุผล</span>
          <select value={form.reason} onChange={(event) => updateField("reason", event.target.value)}>
            {reasonOptions.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
          </select>
        </label>
        <label className="audit-carryover-note">
          <span>หมายเหตุ</span>
          <input value={form.note} onChange={(event) => updateField("note", event.target.value)} />
        </label>
        <button type="submit" disabled={busy}>
          <Plus size={15} />
          <span>{busy ? "กำลังบันทึก..." : "เพิ่มยอดถอนข้ามวัน"}</span>
        </button>
      </form>

      {items.length ? (
        <div className="audit-carryover-list">
          {items.map((item) => {
            const role = item.boDate === date ? "เลื่อนไปโอนวันอื่น" : "รับยอดจากวันก่อน";
            return (
              <div className="audit-carryover-row" key={item.id}>
                <div>
                  <strong>{role}: {money.format(item.amount)}</strong>
                  <span>BO {item.boDate} · โอนจริง {item.paidDate} · {item.reason || "-"}</span>
                  {item.note ? <small>{item.note}</small> : null}
                </div>
                <button type="button" onClick={() => remove(item.id)} disabled={deletingId === item.id} aria-label="ลบยอดถอนข้ามวัน">
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">ยังไม่มียอดถอนข้ามวันของวันที่เลือก</div>
      )}

      {message ? (
        <div className={`msg ${tone === "ok" ? "msg-success" : "msg-error"}`} role="status">
          {tone === "ok" ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}
          <span>{message}</span>
        </div>
      ) : null}
    </div>
  );
}
