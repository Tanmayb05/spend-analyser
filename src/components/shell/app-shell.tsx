"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LogOut, Menu, Plus } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useAppData } from "@/components/app-data";
import { signOut } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";
import { MOBILE_PRIMARY, NAV, SIDE_ROW, SIDE_ROW_ACTIVE, SIDE_ROW_IDLE, isActive } from "./nav";
import { useCloseOverlays } from "@/hooks/use-close-overlays";
import { NotificationsProvider } from "@/components/notifications/notifications-provider";
import { NotificationBell } from "@/components/notifications/bell";
import { NotificationPanel } from "@/components/notifications/notification-panel";
import type { Notice } from "@/lib/notifications/types";

export function AppShell({ children, notices }: { children: ReactNode; notices: Promise<Notice[]> }) {
  useCloseOverlays();
  const pathname = usePathname();
  const { openTxnSheet } = useAppData();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <NotificationsProvider source={notices}>
    <div className="min-h-dvh lg:flex lg:gap-4 lg:p-4">
      {/* Desktop sidebar: 240 wide, so content starts at 16 + 240 + 16 = --sidebar-offset (17rem) */}
      <aside className="sticky top-4 z-40 hidden h-[calc(100dvh-2rem)] w-60 shrink-0 flex-col rounded-card border border-border bg-surface p-compact lg:flex">
        <Link href="/" aria-label="Spend Analyser, Overview" className="flex h-9 items-center gap-3 px-3">
          <Logo size={24} />
          <span className="text-base font-medium text-text">Spend Analyser</span>
        </Link>
        <nav className="mt-6 flex flex-col gap-1" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn(SIDE_ROW, active ? SIDE_ROW_ACTIVE : SIDE_ROW_IDLE)}>
                <Icon size={18} className="shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-1">
          <NotificationBell variant="sidebar" />
          <form action={signOut}>
            <button type="submit" className={cn(SIDE_ROW, SIDE_ROW_IDLE)}>
              <LogOut size={18} className="shrink-0" />
              Sign out
            </button>
          </form>
          <Button variant="accent" size="sm" onClick={() => openTxnSheet()} className="mt-2 w-full">
            <Plus size={18} />
            Add transaction
          </Button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile top bar: logo + notifications (account lives under Settings) */}
        <header className="flex items-center justify-between px-4 pb-2 pt-4 lg:hidden">
          <Link href="/" aria-label="Overview" className="inline-flex">
            <Logo size={32} />
          </Link>
          <NotificationBell variant="header" />
        </header>

        <main className="mx-auto w-full max-w-400 px-4 pb-28 pt-2 lg:px-2 lg:pb-6 lg:pt-2">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface px-2 pt-2 lg:hidden" aria-label="Main">
        <div className="mx-auto grid max-w-md grid-cols-5 items-center">
          {NAV.filter((n) => (MOBILE_PRIMARY as readonly string[]).includes(n.href)).slice(0, 2).map((n) => (
            <MobileTab key={n.href} {...n} active={isActive(pathname, n.href)} />
          ))}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => openTxnSheet()}
              className="grid h-11 w-11 place-items-center rounded-control bg-accent text-accent-fg"
              aria-label="Add transaction"
            >
              <Plus size={20} />
            </button>
          </div>
          {NAV.filter((n) => n.href === "/trips").map((n) => (
            <MobileTab key={n.href} {...n} active={isActive(pathname, n.href)} />
          ))}
          <button type="button" onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-1 py-1 text-xs text-muted">
            <Menu size={18} />
            More
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="grid gap-1">
          {NAV.filter((n) => !(MOBILE_PRIMARY as readonly string[]).includes(n.href)).map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setMoreOpen(false)} className="flex items-center gap-3 rounded-control px-3 py-3 hover:bg-surface-2">
              <Icon size={18} className="text-muted" />
              {label}
            </Link>
          ))}
          <form action={signOut}>
            <button type="submit" className="flex w-full items-center gap-3 rounded-control px-3 py-3 text-bad hover:bg-surface-2">
              <LogOut size={18} />
              Sign out
            </button>
          </form>
        </div>
      </Sheet>
      <NotificationPanel />
    </div>
    </NotificationsProvider>
  );
}

function MobileTab({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Plus; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-1 py-1 text-xs", active ? "text-text" : "text-muted")}>
      <Icon size={18} />
      {label}
    </Link>
  );
}
