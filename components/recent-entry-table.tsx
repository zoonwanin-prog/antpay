import type { JsonRecord } from "@/lib/types";

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Column = {
  key: string;
  label: string;
  type?: "money" | "number" | "date" | "datetime";
  className?: string;
};

const columnsByKind: Record<string, Column[]> = {
  transfers: [
    { key: "date", label: "วันที่", type: "date" },
    { key: "time", label: "เวลา" },
    { key: "source_account", label: "บัญชีต้นทาง" },
    { key: "status", label: "สถานะ" },
    { key: "target_account", label: "บัญชีปลายทาง" },
    { key: "amount", label: "จำนวน", type: "money", className: "num" },
    { key: "fee", label: "Fee", type: "money", className: "num" },
    { key: "user_name", label: "ผู้บันทึก" }
  ],
  crypto_transactions: [
    { key: "date", label: "วันที่", type: "date" },
    { key: "time", label: "เวลา" },
    { key: "status", label: "สถานะ" },
    { key: "target_account", label: "ปลายทาง" },
    { key: "amount_thb", label: "THB", type: "money", className: "num" },
    { key: "exchange_rate", label: "Rate", type: "number", className: "num" },
    { key: "usdt", label: "USDT", type: "number", className: "num" },
    { key: "user_name", label: "ผู้บันทึก" }
  ],
  balances: [
    { key: "date", label: "วันที่", type: "date" },
    { key: "time", label: "เวลา" },
    { key: "account_name", label: "บัญชี" },
    { key: "balance_type", label: "ประเภท" },
    { key: "amount", label: "ยอด", type: "money", className: "num" },
    { key: "user_name", label: "ผู้บันทึก" },
    { key: "note", label: "หมายเหตุ" }
  ],
  expenses: [
    { key: "date", label: "วันที่", type: "date" },
    { key: "time", label: "เวลา" },
    { key: "item", label: "รายการ" },
    { key: "amount", label: "จำนวน", type: "money", className: "num" },
    { key: "user_name", label: "ผู้บันทึก" },
    { key: "note", label: "หมายเหตุ" }
  ],
  bogo2pay_transactions: [
    { key: "date", label: "วันที่", type: "date" },
    { key: "time", label: "เวลา" },
    { key: "item", label: "รายการ" },
    { key: "type", label: "ประเภท" },
    { key: "actual_amount", label: "ยอดจริง", type: "money", className: "num" },
    { key: "fee", label: "Fee", type: "money", className: "num" },
    { key: "net_amount", label: "สุทธิ", type: "money", className: "num" },
    { key: "user_name", label: "ผู้บันทึก" }
  ],
  safewallet_transactions: [
    { key: "date", label: "วันที่", type: "date" },
    { key: "time", label: "เวลา" },
    { key: "account_name", label: "ชื่อบัญชี" },
    { key: "amount_thb", label: "AMOUNT (THB)", type: "money", className: "num" },
    { key: "fee_percent", label: "FEE%", type: "number", className: "num" },
    { key: "fee_amount", label: "ค่าธรรมเนียม", type: "money", className: "num" },
    { key: "net_thb", label: "NET (THB)", type: "money", className: "num" },
    { key: "user_name", label: "ผู้ทำรายการ" }
  ]
};

function formatValue(row: JsonRecord, column: Column) {
  const value = row[column.key];
  if (value === null || value === undefined || value === "") return "-";
  if (column.type === "money") return money.format(Number(value || 0));
  if (column.type === "number") return money.format(Number(value || 0));
  if (column.type === "date") return String(value).slice(0, 10);
  if (column.type === "datetime") return String(value).replace("T", " ").slice(0, 19);
  return String(value);
}

export function RecentEntryTable({
  kind,
  rows,
  title = "รายการล่าสุด",
  description = "ดึงจาก Supabase โดยตรง"
}: {
  kind: keyof typeof columnsByKind;
  rows: JsonRecord[];
  title?: string;
  description?: string;
}) {
  const columns = columnsByKind[kind];
  return (
    <section className="panel data-list-panel is-stack">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={column.className}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <div className="empty-state">ยังไม่มีรายการในตารางนี้</div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={String(row.id || row.import_key || row.source_ref || `${row.date}-${row.created_at}`)}>
                  {columns.map((column) => (
                    <td key={column.key} className={column.className}>{formatValue(row, column)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
