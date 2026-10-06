import type { ReactNode } from "react";
import { SettingsBack } from "./settings-nav";
import { InfoTitle } from "@/components/ui/info-title";

export function SettingsPage({ title, description, info, children }: { title: string; description?: ReactNode; info?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0 flex-1">
      <SettingsBack />
      <InfoTitle as="h1" info={info} className="text-2xl font-medium sm:text-3xl">{title}</InfoTitle>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      <div className="mt-6 space-y-4">{children}</div>
    </div>
  );
}
