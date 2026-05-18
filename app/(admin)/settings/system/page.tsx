import { connection } from "next/server";
import { Bot, KeyRound, Radio } from "lucide-react";
import { AdminShell, MetricCard } from "@/components/admin-shell";
import { GoogleDriveCard } from "@/components/google-drive-card";
import { SettingsSystemPanels } from "@/components/settings-system-panels";
import { listSettingsOverview } from "@/lib/repositories";
import { getGo2PayTokenStatus, getStatementDriveAccessPasswordStatus, getTelegramBotTokenStatus, getTelegramSettingsStatus } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

function envStatus(name: string) {
  return process.env[name] ? "พร้อม" : "ยังไม่ตั้ง";
}

export default async function SystemSettingsPage() {
  await connection();
  const [{ botLogs }, tokenStatus, drivePasswordStatus, telegramRows, telegramTokenStatus] = await Promise.all([
    listSettingsOverview(),
    getGo2PayTokenStatus(),
    getStatementDriveAccessPasswordStatus(),
    getTelegramSettingsStatus(),
    getTelegramBotTokenStatus()
  ]);
  return (
    <AdminShell active="settingsSystem" title="ตั้งค่าระบบ" description="Bot operations, token admin, Telegram, log bot และการเชื่อม Google">
      <section className="grid compact-card-grid">
        <MetricCard label="Bot logs" value={String(botLogs.length)} icon={<Bot size={18} />} />
        <MetricCard label="Token admin" value={envStatus("GO2PAY_ADMIN_TOKEN")} icon={<KeyRound size={18} />} />
        <MetricCard label="Telegram" value={envStatus("TELEGRAM_BOT_TOKEN")} icon={<Radio size={18} />} />
        <GoogleDriveCard returnTo="/settings/system" />
      </section>

      <SettingsSystemPanels
        botLogs={botLogs}
        tokenStatus={tokenStatus}
        drivePasswordStatus={drivePasswordStatus}
        telegramRows={telegramRows}
        telegramTokenStatus={telegramTokenStatus}
      />
    </AdminShell>
  );
}
