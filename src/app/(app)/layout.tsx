import { AppDataProvider } from "@/components/app-data";
import { AppShell } from "@/components/shell/app-shell";
import { TransactionSheet } from "@/components/transactions/transaction-sheet";
import { getReferenceData } from "@/lib/data/reference";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const data = await getReferenceData();
  return (
    <AppDataProvider data={data}>
      <AppShell>{children}</AppShell>
      <TransactionSheet />
    </AppDataProvider>
  );
}
