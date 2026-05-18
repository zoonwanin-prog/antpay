import { connection } from "next/server";
import { KeyRound, Radio, ShieldCheck } from "lucide-react";
import { AdminShell, MetricCard } from "@/components/admin-shell";
import { SettingsForms } from "@/components/settings-forms";
import { SettingsManager } from "@/components/settings-manager";
import { listSettingsOverview } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  await connection();
  const { users, bankAccounts, cryptoAccounts } = await listSettingsOverview();
  return (
    <AdminShell active="settingsAccounts" title="ตั้งค่าบัญชีและ User" description="จัดการบัญชีธนาคาร บัญชีคริปโต และผู้ใช้งานระบบ">
      <section className="grid compact-card-grid settings-metric-grid">
        <MetricCard label="ผู้ใช้งาน" value={String(users.length)} icon={<ShieldCheck size={18} />} />
        <MetricCard label="บัญชีธนาคาร" value={String(bankAccounts.length)} icon={<Radio size={18} />} />
        <MetricCard label="บัญชีคริปโต" value={String(cryptoAccounts.length)} icon={<KeyRound size={18} />} />
      </section>

      <SettingsForms />
      <SettingsManager users={users} bankAccounts={bankAccounts} cryptoAccounts={cryptoAccounts} />
    </AdminShell>
  );
}
