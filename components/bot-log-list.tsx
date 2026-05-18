"use client";

import { useMemo, useState } from "react";
import { Bot } from "lucide-react";
import type { JsonRecord } from "@/lib/types";

const PAGE_SIZE = 10;

function text(row: JsonRecord, key: string) {
  const value = row[key];
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function dateTime(value: unknown) {
  return String(value || "-").replace("T", " ").slice(0, 19);
}

function numberText(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? String(number) : "0";
}

export function BotLogList({ rows }: { rows: JsonRecord[] }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, safePage]);

  return (
    <section className="panel settings-list-panel bot-log-panel">
      <div className="panel-header">
        <div>
          <h2><Bot size={18} /> Log bot การดึงข้อมูล</h2>
          <p>สถานะ cron/import/sync ล่าสุดจากตาราง bot_logs</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>วันที่</th>
              <th>เวลา</th>
              <th>งาน</th>
              <th>สถานะ</th>
              <th>เพิ่ม</th>
              <th>อัปเดต</th>
              <th>อ่าน</th>
              <th>รายละเอียด</th>
              <th>สร้างเมื่อ</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state">ยังไม่มี log bot</div>
                </td>
              </tr>
            ) : (
              pageRows.map((row, index) => {
                const ok = text(row, "status").toLowerCase() === "success";
                return (
                  <tr key={`${text(row, "id")}-${safePage}-${index}`}>
                    <td>{text(row, "date").slice(0, 10)}</td>
                    <td>{text(row, "time")}</td>
                    <td>{text(row, "job")}</td>
                    <td><span className={ok ? "audit-pill ok" : "audit-pill warn"}>{text(row, "status")}</span></td>
                    <td>{numberText(row.inserted)}</td>
                    <td>{numberText(row.updated)}</td>
                    <td>{numberText(row.scanned)}</td>
                    <td className="log-detail">{text(row, "detail")}</td>
                    <td>{dateTime(row.created_at)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {rows.length > PAGE_SIZE ? (
        <div className="table-pagination bot-log-pagination">
          <span className="pagination-summary">
            แสดง {(safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, rows.length)} จาก {rows.length} รายการ
          </span>
          <div>
            <button type="button" className="btn-secondary" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
              ก่อนหน้า
            </button>
            <button type="button" className="btn-secondary" disabled={safePage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>
              ถัดไป
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
