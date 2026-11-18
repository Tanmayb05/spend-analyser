"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LogOut, Menu, Plus } from "lucide-react";
import { Logo } from "@/components/logo";
import { Sheet } from "@/components/ui/sheet";
import { useAppData } from "@/components/app-data";
import { signOut } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";
import { MOBILE_PRIMARY, NAV, isActive } from "./nav";
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
      {/* Desktop sidebar */}
      <aside className="sticky top-4 z-40 hidden h-[calc(100dvh-2rem)] w-20 shrink-0 flex-col items-center rounded-[28px] border border-border bg-surface py-5 lg:flex">
        <Link href="/" aria-label="Overview">
          <Logo size={44} />
        </Link>
        <button
          type="button"
          onClick={() => openTxnSheet()}
          className="group relative mt-8 grid h-12 w-12 place-items-center rounded-2xl bg-accent text-accent-fg"
          aria-label="Add transaction"
        >
          <Plus size={22} />
          <SideTip>Add transaction</SideTip>
        </button>
        <div className="mt-2">
          <NotificationBell variant="sidebar" tip={<SideTip>Notifications</SideTip>} />
        </div>
        <div className="mt-2 h-px w-8 bg-border" aria-hidden />
        <nav className="mt-2 flex flex-1 flex-col items-center gap-2" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              className={cn(
                "group relative grid h-12 w-12 place-items-center rounded-2xl transition",
                isActive(pathname, href) ? "bg-text text-bg" : "text-muted hover:bg-surface-3 hover:text-text",
              )}
            >
              <Icon size={20} />
              <SideTip>{label}</SideTip>
            </Link>
          ))}
        </nav>
        <form action={signOut}>
          <button type="submit" className="group relative grid h-12 w-12 place-items-center rounded-2xl text-muted hover:bg-surface-3 hover:text-text" aria-label="Sign out">
            <LogOut size={20} />
            <SideTip>Sign out</SideTip>
          </button>
        </form>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile top bar: logo + notifications (account lives under Settings) */}
        <header className="flex items-center justify-between px-4 pb-2 pt-4 lg:hidden">
          <Link href="/" aria-label="Overview" className="inline-flex">
            <Logo size={32} />
          </Link>
          <NotificationBell variant="header" />
        </header>

        <main className="px-4 pb-28 pt-2 lg:px-2 lg:pb-6 lg:pt-2">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-2 pt-2 backdrop-blur lg:hidden" aria-label="Main">
        <div className="mx-auto grid max-w-md grid-cols-5 items-center">
          {NAV.filter((n) => (MOBILE_PRIMARY as readonly string[]).includes(n.href)).slice(0, 2).map((n) => (
            <MobileTab key={n.href} {...n} active={isActive(pathname, n.href)} />
          ))}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => openTxnSheet()}
              className="-mt-6 grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-fg shadow-lg shadow-accent/30"
              aria-label="Add transaction"
            >
              <Plus size={26} />
            </button>
          </div>
          {NAV.filter((n) => n.href === "/trips").map((n) => (
            <MobileTab key={n.href} {...n} active={isActive(pathname, n.href)} />
          ))}
          <button type="button" onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-1 py-1 text-xs text-muted">
            <Menu size={22} />
            More
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="grid gap-1">
          {NAV.filter((n) => !(MOBILE_PRIMARY as readonly string[]).includes(n.href)).map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setMoreOpen(false)} className="flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-surface-2">
              <Icon size={20} className="text-muted" />
              {label}
            </Link>
          ))}
          <form action={signOut}>
            <button type="submit" className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-bad hover:bg-surface-2">
              <LogOut size={20} />
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
      <Icon size={22} />
      {label === "Transactions" ? "Activity" : label}
    </Link>
  );
}

/** Hover/focus label that slides out to the right of a sidebar icon. Decorative: the control already has an aria-label. */
function SideTip({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-lg border border-border bg-surface-3 px-2.5 py-1.5 text-xs font-medium text-text opacity-0 shadow-xl transition duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 motion-reduce:transition-none"
    >
      {children}
    </span>
  );
}
