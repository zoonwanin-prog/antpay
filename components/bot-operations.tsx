"use client";

import { useState } from "react";
import { Bot, Building2, CalendarDays, CalendarRange, Clock, DatabaseZap, FileSpreadsheet, ShieldCheck, Ticket, Trash2, Wallet, Workflow } from "lucide-react";

const operations = [
  { action: "sync_all", label: "Sync ทั้งหมด", icon: Workflow },
  { action: "tickets", label: "Sync Ticket", icon: Ticket },
  { action: "safewallet", label: "Sync SafeWallet", icon: ShieldCheck },
  { action: "settlements", label: "Sync Settlement USDT", icon: DatabaseZap },
  { action: "bogo2pay", label: "Sync BoGo2pay", icon: Building2 },
  { action: "statement_daily", label: "Sync Statement Daily", icon: FileSpreadsheet },
  { action: "wallet_snapshot", label: "Snap main+payout", icon: Wallet },
  { action: "cleanup_bot_logs", label: "Cleanup Bot Logs", icon: Trash2 }
];

function bangkokToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export function BotOperations() {
  const [running, setRunning] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"today" | "date" | "month">("today");
  const [date, setDate] = useState(() => bangkokToday());
  const [month, setMonth] = useState(() => bangkokToday().slice(0, 7));

  async function run(action: string) {
    setRunning(action);
    setMessage("");
    try {
      const res = await fetch("/api/bot-operations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, mode, date, month })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "สั่งงานไม่สำเร็จ");
      setMessage(`${action}: ${JSON.stringify(json)}`);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "สั่งงานไม่สำเร็จ");
    } finally {
      setRunning("");
    }
  }

  return (
    <section className="panel bot-ops-panel">
      <div className="panel-header">
        <div>
          <h2><Bot size={18} /> Bot operations</h2>
          <p>เลือกช่วงเวลาแล้วสั่ง sync ด้วยมือ ระบบจะเช็ค key กันซ้ำก่อน upsert เข้า Supabase</p>
        </div>
      </div>
      <div className="bot-sync-options">
        <label>
          <span>รูปแบบ sync</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as "today" | "date" | "month")}>
            <option value="today">ซิงก์ตอนนี้ / วันนี้</option>
            <option value="date">ซิงก์เลือกวันที่</option>
            <option value="month">ซิงก์ทั้งเดือน</option>
          </select>
        </label>
        <label>
          <span><CalendarDays size={14} /> วันที่</span>
          <input type="date" value={date} disabled={mode !== "date"} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>
          <span><CalendarRange size={14} /> เดือน</span>
          <input type="month" value={month} disabled={mode !== "month"} onChange={(event) => setMonth(event.target.value)} />
        </label>
        <div className="bot-sync-note">
          <Clock size={14} />
          <span>{mode === "today" ? "ใช้วันที่วันนี้ตามเวลาไทย" : mode === "date" ? `ใช้วันที่ ${date}` : `ใช้ทั้งเดือน ${month}`}</span>
        </div>
      </div>
      <div className="bot-ops-grid">
        {operations.map((operation) => {
          const Icon = operation.icon;
          return (
            <button key={operation.action} type="button" disabled={running === operation.action} onClick={() => run(operation.action)}>
              <Icon size={16} />
              <span>{running === operation.action ? "กำลังรัน..." : operation.label}</span>
            </button>
          );
        })}
      </div>
      {message ? <div className="msg msg-info settings-inline-message">{message}</div> : null}
    </section>
  );
}
