import { BotLogList } from "@/components/bot-log-list";
import { BotOperations } from "@/components/bot-operations";
import { DrivePasswordCard } from "@/components/drive-password-card";
import { Go2PayTokenCard } from "@/components/go2pay-token-card";
import { TelegramSettingsCard } from "@/components/telegram-settings-card";
import type { JsonRecord } from "@/lib/types";

export function SettingsSystemPanels({
  botLogs,
  tokenStatus,
  drivePasswordStatus,
  telegramRows,
  telegramTokenStatus
}: {
  botLogs: JsonRecord[];
  tokenStatus: { hasToken: boolean; source: string; masked: string };
  drivePasswordStatus: { enabled: boolean; masked: string };
  telegramTokenStatus: { hasToken: boolean; source: string; masked: string };
  telegramRows: {
    target: "transfer" | "crypto" | "ticket" | "alert";
    chatId: string;
    threadId: string;
    chatSource: string;
    threadSource: string;
  }[];
}) {
  return (
    <>
      <BotOperations />

      <section className="settings-grid settings-env-grid">
        <Go2PayTokenCard initialStatus={tokenStatus} />
        <DrivePasswordCard initialStatus={drivePasswordStatus} />
        <TelegramSettingsCard initialRows={telegramRows} initialTokenStatus={telegramTokenStatus} />

      </section>

      <section className="settings-list-grid">
        <BotLogList rows={botLogs} />
      </section>
    </>
  );
}
