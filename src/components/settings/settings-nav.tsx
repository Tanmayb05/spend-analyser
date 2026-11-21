"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { SIDE_ROW, SIDE_ROW_ACTIVE, SIDE_ROW_IDLE } from "@/components/shell/nav";
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
      {/* same panel as the main sidebar: bordered surface, hairline active row (SIDE_ROW) */}
      <div
        className="sticky top-4 max-h-[calc(100dvh-2rem)] w-64 space-y-6 overflow-y-auto rounded-card border border-border bg-surface p-compact"
        style={{ opacity: paneOpen ? 1 : 0, transform: paneOpen ? "none" : `translateX(-${PANE_SLIDE}px)`, transition: paneTransition }}
      >
        {SETTINGS_GROUPS.map((group) => (
          <section key={group.title} aria-labelledby={`settings-group-${group.id}`}>
            <h2 id={`settings-group-${group.id}`} className="text-label mb-2 px-2 text-faint">
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
                      className={cn(SIDE_ROW, "px-2", active ? SIDE_ROW_ACTIVE : SIDE_ROW_IDLE)}
                    >
                      {/* tile holder: the Settings-home tile lands here (hidden until it arrives); same size as the home tile */}
                      <span
                        data-settings-icon={href}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-inset bg-surface-3"
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
    <Link href="/settings" className="mb-3 inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-text lg:hidden">
      <ChevronLeft size={16} aria-hidden /> Settings
    </Link>
  );
}
