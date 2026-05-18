import { connection } from "next/server";
import { AdminShell } from "@/components/admin-shell";
import { EntryForm } from "@/components/entry-form";
import { RecentEntryFeed } from "@/components/recent-entry-feed";
import { listMasterData, listRecentEntryFeed } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function EntriesPage() {
  await connection();
  const [rows, masterData] = await Promise.all([listRecentEntryFeed(), listMasterData()]);
  return (
    <AdminShell
      active="dashboard"
      title="บันทึกรายการรวม"
      description="ฟอร์มกลางสำหรับบันทึกรายการทุกประเภทในที่เดียว"
    >
      <EntryForm {...masterData} />
      <RecentEntryFeed rows={rows} />
    </AdminShell>
  );
}
