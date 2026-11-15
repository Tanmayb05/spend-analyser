"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SETTINGS_GROUPS } from "./nav";

export function SettingsNav() {
  const pathname = usePathname();
  // the Settings landing page is the menu itself; the side pane appears once a setting is open
  if (pathname.replace(/\/$/, "") === "/settings") return null;
  return (
    <nav aria-label="Settings" className="hidden w-64 shrink-0 lg:block">
      {/* same panel as the main sidebar: bordered surface, rounded, ink-on-light active item */}
      <div className="sticky top-4 max-h-[calc(100dvh-2rem)] space-y-5 overflow-y-auto rounded-[28px] border border-border bg-surface p-3">
        {SETTINGS_GROUPS.map((group) => (
          <section key={group.title} aria-labelledby={`settings-group-${group.id}`}>
            <h2 id={`settings-group-${group.id}`} className="mb-1.5 px-3 text-xs font-medium uppercase tracking-wide text-faint">
              {group.title}
            </h2>
            <ul className="space-y-1">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-11 items-center gap-3 rounded-2xl px-3 text-sm transition focus-visible:outline-2 focus-visible:outline-accent",
                        active ? "bg-text font-medium text-bg" : "text-muted hover:bg-surface-3 hover:text-text",
                      )}
                    >
                      <Icon size={18} />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  );
}

export function SettingsBack() {
  return (
    <Link href="/settings" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text lg:hidden">
      ← Settings
    </Link>
  );
}
