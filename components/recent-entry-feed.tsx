import type { JsonRecord } from "@/lib/types";

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function text(row: JsonRecord, key: string) {
  const value = row[key];
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export function RecentEntryFeed({ rows }: { rows: JsonRecord[] }) {
  return (
    <section className="panel data-list-panel is-stack">
      <div className="panel-header">
        <div>
          <h2>รายการล่าสุดทุกประเภท</h2>
          <p>รวมรายการล่าสุดจากโยกเงิน คริปโต ยอดคงเหลือ รายจ่าย และ BoAntpay</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ประเภท</th>
              <th>วันที่</th>
              <th>สถานะ/รายการ</th>
              <th>บัญชี/ปลายทาง</th>
              <th className="num">ยอด</th>
              <th>ผู้บันทึก</th>
              <th>สร้างเมื่อ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">ยังไม่มีรายการล่าสุด</div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${text(row, "feed_type")}-${text(row, "id")}`}>
                  <td>{text(row, "feed_type")}</td>
                  <td>{text(row, "date").slice(0, 10)}</td>
                  <td>{text(row, "status") !== "-" ? text(row, "status") : text(row, "item") !== "-" ? text(row, "item") : text(row, "balance_type")}</td>
                  <td>{text(row, "target_account") !== "-" ? text(row, "target_account") : text(row, "account_name") !== "-" ? text(row, "account_name") : text(row, "source_account")}</td>
                  <td className="num">{money.format(Number(row.feed_amount || 0))}</td>
                  <td>{text(row, "user_name")}</td>
                  <td>{text(row, "created_at").replace("T", " ").slice(0, 19)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
