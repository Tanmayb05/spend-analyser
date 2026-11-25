import { headers } from "next/headers";
import { AppDataProvider } from "@/components/app-data";
import { AppShell } from "@/components/shell/app-shell";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-provider";
import { TransactionSheet } from "@/components/transactions/transaction-sheet";
import { getReferenceData } from "@/lib/data/reference";
import { getNotifications } from "@/lib/data/notifications";
import { platformFrom } from "@/lib/shortcuts/keys";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [data, h] = await Promise.all([getReferenceData(), headers()]);
  // first render already shows ⌘ or Ctrl: Chromium sends the OS as a client hint, everyone sends a user agent
  const platform = platformFrom(h.get("sec-ch-ua-platform"), h.get("user-agent"));
  return (
    <AppDataProvider data={data}>
      <ShortcutsProvider initialPlatform={platform}>
        {/* not awaited: notices stream in, so the page never waits on them */}
        <AppShell notices={getNotifications().catch(() => [])}>{children}</AppShell>
        <TransactionSheet />
      </ShortcutsProvider>
    </AppDataProvider>
  );
}
