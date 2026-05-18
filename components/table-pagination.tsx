import Link from "next/link";
import type { Route } from "next";

export function TablePagination({
  basePath,
  date,
  page,
  pageCount,
  totalRows
}: {
  basePath: string;
  date: string;
  page: number;
  pageCount: number;
  totalRows: number;
}) {
  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(pageCount, page + 1);
  const prevHref = `${basePath}?date=${encodeURIComponent(date)}&page=${prevPage}` as Route;
  const nextHref = `${basePath}?date=${encodeURIComponent(date)}&page=${nextPage}` as Route;
  return (
    <div className="table-pagination">
      <span className="pagination-summary">แสดง 20 รายการต่อหน้า · ทั้งหมด {totalRows} รายการ</span>
      <div className="pagination-controls">
        {page > 1 ? <Link className="btn-secondary" href={prevHref}>ก่อนหน้า</Link> : <span className="btn-secondary is-disabled">ก่อนหน้า</span>}
        <span className="pagination-page">หน้า {page} / {pageCount}</span>
        {page < pageCount ? <Link className="btn-secondary" href={nextHref}>ถัดไป</Link> : <span className="btn-secondary is-disabled">ถัดไป</span>}
      </div>
    </div>
  );
}
