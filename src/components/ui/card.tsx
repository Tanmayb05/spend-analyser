import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { InfoTitle } from "./info-title";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-card)] border border-border bg-surface p-5", className)} {...props} />;
}

export function CardHeader({ title, action, subtitle, info }: { title: ReactNode; action?: ReactNode; subtitle?: ReactNode; info?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <InfoTitle info={info} className="text-lg font-medium leading-tight">{title}</InfoTitle>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** One-line plain-language takeaway shown under a chart. */
export function Insight({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 rounded-2xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-muted">{children}</p>
  );
}
