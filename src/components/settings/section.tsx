import type { ReactNode } from "react";
import { SettingsBack } from "./settings-nav";

export function SettingsPage({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0 flex-1">
      <SettingsBack />
      <h1 className="text-2xl font-medium sm:text-3xl">{title}</h1>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      <div className="mt-6 space-y-4">{children}</div>
    </div>
  );
}
