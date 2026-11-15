import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SETTINGS_GROUPS } from "@/components/settings/nav";

export const metadata = { title: "Settings" };

export default function SettingsIndex() {
  return (
    <div className="min-w-0 flex-1">
      <h1 className="text-2xl font-medium">Settings</h1>
      {SETTINGS_GROUPS.map((group) => (
        <section key={group.title} aria-labelledby={`settings-index-${group.id}`} className="mt-6">
          <h2 id={`settings-index-${group.id}`} className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-faint">
            {group.title}
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
            {group.items.map(({ href, label, desc, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-2">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-surface-3 text-muted">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{label}</span>
                    <span className="block truncate text-sm text-muted">{desc}</span>
                  </span>
                  <ChevronRight size={18} className="text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
