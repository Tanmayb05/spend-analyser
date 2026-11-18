import { AppDataProvider } from "@/components/app-data";
import { AppShell } from "@/components/shell/app-shell";
import { TransactionSheet } from "@/components/transactions/transaction-sheet";
import { getReferenceData } from "@/lib/data/reference";
import { getNotifications } from "@/lib/data/notifications";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const data = await getReferenceData();
  return (
    <AppDataProvider data={data}>
      {/* not awaited: notices stream in, so the page never waits on them */}
      <AppShell notices={getNotifications().catch(() => [])}>{children}</AppShell>
      <TransactionSheet />
    </AppDataProvider>
  );
}
