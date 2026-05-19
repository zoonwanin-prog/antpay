import { connection } from "next/server";
import {
  Bitcoin,
  CalendarDays,
  Landmark,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  WalletMinimal
} from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { getDashboardSummary } from "@/lib/dashboard";
import { bangkokDate } from "@/lib/dates";
import { getLatestRowDate } from "@/lib/repositories";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdt = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function safeDate(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : bangkokDate();
}

function displayDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function DashboardCard({
  label,
  value,
  tone = "orange",
  hint
}: {
  label: string;
  value: string;
  tone?: "orange" | "green" | "blue" | "purple" | "red" | "slate";
  hint?: string;
}) {
  return (
    <div className={`daily-card tone-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      {hint ? <span>{hint}</span> : null}
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="daily-section-title">
      {icon}
      <span>{children}</span>
    </h2>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await connection();
  const params = await searchParams;
  const selectedDate = params.date
    ? safeDate(params.date)
    : (await getLatestRowDate("bank_statement_daily", "date")) || bangkokDate();
  let summary: Awaited<ReturnType<typeof getDashboardSummary>> | null = null;
  let setupError = "";
  try {
    summary = await getDashboardSummary(selectedDate);
  } catch (error) {
    setupError = error instanceof Error ? error.message : "ยังไม่สามารถโหลดข้อมูลได้";
  }

  if (!summary) {
    return (
      <AdminShell active="dashboard" title="Dashboard ภาพรวม" description="daily-dashboard">
        <div className="card">
          <h2>ไม่สามารถแสดงข้อมูลได้</h2>
          <p>{setupError || "กรุณาตรวจสอบการตั้งค่าระบบ"}</p>
        </div>
      </AdminShell>
    );
  }

  const day = summary.auditDay;
  const daily = summary.summaryDay;
  const crypto = summary.cryptoDay;
  // ใช้ ?? เพื่อให้ 0 จริงไม่ถูก fallback ไปทับ
  const feeProfit = daily?.feeProfit ?? 0;
  const safeWalletFee = daily?.feeCost ?? summary.safeWallet.fee ?? 0;
  const totalProfit = feeProfit + safeWalletFee;
  const safeWalletAmount = summary.safeWallet.amount ?? 0;
  const safeWalletNet = summary.safeWallet.net ?? (safeWalletAmount - safeWalletFee);
  const mainWallet = daily?.mainWalletBalance ?? 0;
  const payoutWallet = daily?.payoutWalletBalance ?? 0;
  const systemBalance = mainWallet + payoutWallet;
  // เงินในบัญชี → ดึงจาก balances ก่อน ถ้าไม่มี fallback ไป audit (ที่ก็ดึงจาก balances)
  const accountBalance = daily?.accountBalance ?? day?.actualBalance ?? 0;
  const boDepositToday = daily?.boDeposit ?? day?.boDeposit ?? 0;
  const boWithdrawToday = daily?.boWithdraw ?? day?.boWithdraw ?? 0;
  const bankDepositToday = daily?.bankDeposit ?? day?.bankDeposit ?? 0;
  const bankWithdrawToday = daily?.bankWithdraw ?? day?.bankWithdraw ?? 0;
  const expenseToday = daily?.expense ?? day?.sheetExpense ?? 0;
  const frozenBalance = daily?.frozenBalance ?? 0;

  return (
    <AdminShell active="dashboard" title="Dashboard ภาพรวม" description="daily-dashboard">
      <form className="daily-filter" action="/" method="get">
        <label htmlFor="dashboard-date">
          <CalendarDays size={16} />
          <span>เลือกวันที่:</span>
        </label>
        <input id="dashboard-date" type="date" name="date" defaultValue={selectedDate} />
        <button type="submit">
          <RefreshCw size={16} />
          <span>แสดงผล</span>
        </button>
      </form>

      <section className="daily-section">
        <SectionTitle icon={<WalletCards size={17} />}>สรุปกำไร</SectionTitle>
        <div className="daily-grid cols-3">
          <DashboardCard label="กำไรค่าธรรมเนียม BOGO2PAY" value={money.format(feeProfit)} tone="orange" />
          <DashboardCard label="ค่าธรรมเนียมขึ้นเหรียญ" value={money.format(safeWalletFee)} tone="purple" />
          <DashboardCard label="กำไรรวมวันนี้" value={money.format(totalProfit)} tone="green" />
        </div>
      </section>

      <section className="daily-section">
        <SectionTitle icon={<WalletMinimal size={17} />}>สรุปยอดคงเหลือ</SectionTitle>
        <div className="daily-grid cols-4">
          <DashboardCard label="เงินในบัญชี" value={money.format(accountBalance)} tone="blue" />
          <DashboardCard label="เงินในระบบ" value={money.format(systemBalance)} tone="purple" hint={`Frozen ${money.format(frozenBalance)}`} />
          <DashboardCard label="MAIN WALLET" value={money.format(mainWallet)} tone="green" />
          <DashboardCard label="PAYOUT WALLET" value={money.format(payoutWallet)} tone="orange" />
        </div>
      </section>

      <section className="daily-section">
        <SectionTitle icon={<Landmark size={17} />}>ฝาก ถอน และรายจ่าย</SectionTitle>
        <div className="daily-grid cols-5">
          <DashboardCard label="ฝาก GO2PAY วันนี้" value={money.format(boDepositToday)} tone="green" />
          <DashboardCard label="ถอน GO2PAY วันนี้" value={money.format(boWithdrawToday)} tone="red" />
          <DashboardCard label="ฝากธนาคารวันนี้" value={money.format(bankDepositToday)} tone="green" />
          <DashboardCard label="ถอนธนาคารวันนี้" value={money.format(bankWithdrawToday)} tone="red" />
          <DashboardCard label="รายจ่ายวันนี้" value={money.format(expenseToday)} tone="red" />
        </div>
      </section>

      <section className="daily-section">
        <SectionTitle icon={<ShieldCheck size={17} />}>SafeWallet</SectionTitle>
        <div className="daily-grid cols-3">
          <DashboardCard label="AMOUNT รวม" value={money.format(safeWalletAmount)} tone="purple" hint={`${summary.safeWallet.count} รายการ`} />
          <DashboardCard label="ค่าธรรมเนียมขึ้นเหรียญ" value={money.format(safeWalletFee)} tone="orange" />
          <DashboardCard label="NET รวม" value={money.format(safeWalletNet)} tone="green" />
        </div>
      </section>

      <section className="daily-section">
        <SectionTitle icon={<Bitcoin size={17} />}>สรุปคริปโต USDT</SectionTitle>
        <div className="daily-grid cols-4">
          <DashboardCard label="ซื้อ USDT" value={usdt.format(crypto?.buyUsdt ?? 0)} tone="green" hint={`จำนวนบาท ${money.format(crypto?.buyThb ?? 0)}`} />
          <DashboardCard label="ถอน USDT" value={usdt.format(crypto?.withdrawUsdt ?? 0)} tone="red" hint={`จำนวนบาท ${money.format(crypto?.withdrawThb ?? 0)}`} />
          <DashboardCard label="โอน USDT" value={usdt.format(crypto?.transferUsdt ?? 0)} tone="blue" hint={`จำนวนบาท ${money.format(crypto?.transferThb ?? 0)}`} />
          <DashboardCard label="คงเหลือ USDT" value={usdt.format(crypto?.cumulativeUsdt ?? 0)} tone="purple" hint={`จำนวนบาท ${money.format(crypto?.cumulativeThb ?? 0)}`} />
        </div>
      </section>

      <div className="daily-sync-bar">
        <ShieldCheck size={15} />
        <span>
          SafeWallet sync: {summary.sync?.date || selectedDate} {summary.sync?.time || "--:--"} | สถานะ: {summary.sync?.status || "รอข้อมูล"} |
          ตรวจ {summary.sync?.scanned || 0} | เพิ่ม {summary.sync?.inserted || 0}
        </span>
        <strong>{displayDate(selectedDate)}</strong>
      </div>
    </AdminShell>
  );
}
