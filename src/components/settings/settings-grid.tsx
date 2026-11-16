"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { SETTINGS_GROUPS } from "./nav";
import { useSettingsTransition } from "./settings-transition";

/** Settings home: every setting as a circle, like a phone's app grid. */
export function SettingsGrid() {
  const { launch, launchedHref } = useSettingsTransition();
  return (
    // every setting in one card; groups are just small labels with a divider between them
    <Card data-settings-grid className="mt-5 divide-y divide-border">
      {SETTINGS_GROUPS.map((group) => (
        <section key={group.title} aria-labelledby={`settings-index-${group.id}`} className="py-5 first:pt-0 last:pb-0">
          <h2 id={`settings-index-${group.id}`} className="mb-3 px-2 text-xs font-medium uppercase tracking-wide text-muted">
            {group.title}
          </h2>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-x-2 gap-y-4">
            {group.items.map(({ href, label, desc, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  title={desc}
                  onClick={(e) => {
                    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    const circle = e.currentTarget.querySelector<HTMLElement>("[data-grid-circle]");
                    // animated open (lg+): the transition takes over navigation; otherwise the link navigates as usual
                    if (circle && launch(href, circle, Icon)) e.preventDefault();
                  }}
                  className="group flex flex-col items-center gap-2.5 rounded-2xl p-2 text-center outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span
                    data-grid-circle
                    style={launchedHref === href ? { visibility: "hidden" } : undefined}
                    className="grid h-16 w-16 place-items-center rounded-full bg-surface-3 text-muted transition group-hover:-translate-y-0.5 group-hover:bg-text group-hover:text-bg group-hover:shadow-md motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
                  >
                    <Icon size={32} />
                  </span>
                  <span className="text-balance text-sm font-medium leading-tight">{label}</span>
                  <span className="-mt-1.5 line-clamp-2 text-balance text-xs leading-snug text-muted max-sm:hidden">{desc}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Card>
  );
}
