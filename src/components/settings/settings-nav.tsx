"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SETTINGS_GROUPS } from "./nav";

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="hidden w-60 shrink-0 lg:block">
      <div className="sticky top-4 space-y-5">
        {SETTINGS_GROUPS.map((group) => (
          <section key={group.title} aria-labelledby={`settings-group-${group.id}`}>
            <h2 id={`settings-group-${group.id}`} className="mb-1.5 border-b border-border px-3 pb-1.5 text-xs font-medium uppercase tracking-wide text-faint">
              {group.title}
            </h2>
            <ul className="space-y-1">
              {group.items.map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={pathname === href ? "page" : undefined}
                    className={cn("flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm", pathname === href ? "bg-surface text-text" : "text-muted hover:bg-surface hover:text-text")}
                  >
                    <Icon size={18} />
                    {label}
                  </Link>
                </li>
              ))}
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
