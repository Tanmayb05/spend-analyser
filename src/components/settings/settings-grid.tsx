"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SETTINGS_GROUPS } from "./nav";
import { useSettingsTransition } from "./settings-transition";

/** Settings home: every setting as a row, grouped under the same headings as the side pane. One row height (56). */
export function SettingsGrid() {
  const { launch, launchedHref } = useSettingsTransition();
  return (
    // data-settings-grid: globals.css fades this out while a setting opens
    <div data-settings-grid className="mt-6 max-w-2xl space-y-8">
      {SETTINGS_GROUPS.map((group) => (
        <section key={group.id} aria-labelledby={`settings-home-${group.id}`}>
          <h2 id={`settings-home-${group.id}`} className="text-label mb-2 px-1 text-muted">
            {group.title}
          </h2>
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <ul className="divide-y divide-border">
              {group.items.map(({ href, label, desc, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={(e) => {
                      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                      const tile = e.currentTarget.querySelector<HTMLElement>("[data-grid-circle]");
                      // animated open (lg+): the transition takes over navigation; otherwise the link navigates as usual
                      if (tile && launch(href, tile, Icon)) e.preventDefault();
                    }}
                    className="group flex h-14 items-center gap-3 px-compact transition-colors hover:bg-surface-2 focus-visible:outline-offset-[-2px]"
                  >
                    <span
                      data-grid-circle
                      style={launchedHref === href ? { visibility: "hidden" } : undefined}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-inset bg-surface-3 text-muted"
                    >
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{label}</span>
                      <span className="block truncate text-xs text-muted">{desc}</span>
                    </span>
                    <ChevronRight size={16} aria-hidden className="shrink-0 text-faint transition-colors group-hover:text-text" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
