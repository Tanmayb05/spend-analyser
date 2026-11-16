"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SETTINGS_GROUPS } from "./nav";
import { PANE_SLIDE, PANE_WIDTH, useSettingsTransition } from "./settings-transition";

export function SettingsNav() {
  const pathname = usePathname();
  const { flyingHref, paneOpen, paneTransition } = useSettingsTransition();
  return (
    // Always in the layout on lg+, collapsed on the Settings home (so opening a setting can slide it in); `inert` keeps it out of reach while closed.
    // overflow-x-clip (not hidden) so the inner panel's `sticky` keeps working.
    <nav
      aria-label="Settings"
      inert={!paneOpen}
      className="hidden shrink-0 overflow-x-clip lg:block"
      style={{ width: paneOpen ? PANE_WIDTH : 0, transition: paneTransition }}
    >
      {/* same panel as the main sidebar: bordered surface, rounded, ink-on-light active item */}
      <div
        className="sticky top-4 max-h-[calc(100dvh-2rem)] w-64 space-y-5 overflow-y-auto rounded-[28px] border border-border bg-surface p-3"
        style={{ opacity: paneOpen ? 1 : 0, transform: paneOpen ? "none" : `translateX(-${PANE_SLIDE}px)`, transition: paneTransition }}
      >
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
                      {/* circle holder: the Settings-home circle lands here (hidden until it arrives) */}
                      <span
                        data-settings-icon={href}
                        className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-3", active ? "text-text" : "text-muted")}
                        style={flyingHref === href ? { visibility: "hidden" } : undefined}
                      >
                        <Icon size={16} />
                      </span>
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
