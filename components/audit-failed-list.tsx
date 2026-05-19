"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import type { AuditDetail } from "@/lib/types";

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function todayBangkok() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

export function AuditFailedList({ items }: { items: AuditDetail[] }) {
  const router = useRouter();
  const [list, setList] = useState<AuditDetail[]>(items);
  const [paidDates, setPaidDates] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((item) => [item.id, item.followupPaidDate || item.payoutDate || todayBangkok()]))
  );
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"" | "ok" | "err">("");

  async function saveFollowup(item: AuditDetail, nextPaid: boolean, paidDate: string) {
    setBusy(item.id);
    setMessage("");
    setTone("");
    try {
      const res = await fetch("/api/payout-followups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: item.id, paid: nextPaid, paidDate })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "ปรับสถานะไม่สำเร็จ");
      setList((current) =>
        current.map((row) =>
          row.id === item.id
            ? {
                ...row,
                followupPaid: nextPaid,
                followupStatus: nextPaid ? "paid" : "pending",
                followupPaidDate: nextPaid ? paidDate : ""
              }
            : row
        )
      );
      setTone("ok");
      setMessage(nextPaid ? "บันทึก 'โอนตามแล้ว' สำเร็จ" : "บันทึก 'ยังโอนไม่สำเร็จ' สำเร็จ");
      router.refresh();
    } catch (err) {
      setTone("err");
      setMessage(err instanceof Error ? err.message : "ปรับสถานะไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  async function toggle(item: AuditDetail) {
    await saveFollowup(item, !item.followupPaid, paidDates[item.id] || item.payoutDate || todayBangkok());
  }

  if (list.length === 0) {
    return <div className="empty-state">ไม่มีรายการถอนไม่สำเร็จในวันนี้</div>;
  }

  return (
    <div className="audit-failed-list">
      {list.map((item, idx) => (
        <div className={`audit-failed-row${item.followupPaid ? " is-paid" : ""}`} key={`${item.id}-${idx}`}>
          {(() => {
            const paidDate = paidDates[item.id] || item.followupPaidDate || item.payoutDate || todayBangkok();
            const paidDayLabel = paidDate === item.payoutDate ? "โอนตามวันเดียวกัน" : "โอนตามวันอื่น";
            return (
              <>
          <div className="audit-failed-copy">
            <strong>#{idx + 1} {item.recipientName || "-"} / {item.recipientAccountNo || "-"}</strong>
            {item.followupPaid ? <span>วันที่โอนตาม {paidDate} · {paidDayLabel}</span> : null}
          </div>
          <div className="audit-failed-amount num">{money.format(item.amount)}</div>
          <label className="audit-failed-date">
            <span>วันที่โอนตาม</span>
            <input
              type="date"
              value={paidDate}
              disabled={busy === item.id}
              onChange={(event) => {
                const nextDate = event.target.value;
                setPaidDates((current) => ({ ...current, [item.id]: nextDate }));
                if (item.followupPaid && nextDate) void saveFollowup(item, true, nextDate);
              }}
            />
          </label>
          <label className="audit-failed-check" title={item.followupPaid ? "โอนตามแล้ว" : "ยังโอนไม่สำเร็จ"}>
            <input
              type="checkbox"
              checked={Boolean(item.followupPaid)}
              disabled={busy === item.id}
              onChange={() => toggle(item)}
            />
            <span className="audit-failed-state">
              {item.followupPaid ? paidDayLabel : "ยังโอนไม่สำเร็จ"}
            </span>
          </label>
              </>
            );
          })()}
        </div>
      ))}
      {message ? (
        <div className={`msg ${tone === "ok" ? "msg-success" : "msg-error"}`} role="status">
          {tone === "ok" ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}
          <span>{message}</span>
        </div>
      ) : null}
    </div>
  );
}
