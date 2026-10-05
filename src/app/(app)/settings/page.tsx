import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SETTINGS_NAV } from "@/components/settings/nav";

export const metadata = { title: "Settings" };

export default function SettingsIndex() {
  return (
    <div className="min-w-0 flex-1">
      <h1 className="text-3xl font-medium">Settings</h1>
      <ul className="mt-6 divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
        {SETTINGS_NAV.map(({ href, label, desc, icon: Icon }) => (
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
    </div>
  );
}
