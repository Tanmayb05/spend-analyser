import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/money";

/** Big-number tile. `goodWhenUp` decides whether an increase is good (income) or bad (spend). */
export function KpiTile({
  label,
  value,
  delta,
  goodWhenUp = false,
  sub,
  progress,
  tone,
}: {
  label: string;
  value: string;
  delta?: number | null;
  goodWhenUp?: boolean;
  sub?: ReactNode;
  progress?: { ratio: number; status: "ok" | "near" | "over" | "none" };
  tone?: "good" | "bad";
}) {
  const up = (delta ?? 0) > 0;
  const good = delta == null || delta === 0 ? null : up === goodWhenUp;
  return (
    <div className="flex min-w-0 flex-col rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cn("num mt-2 truncate text-[28px] font-medium leading-none sm:text-4xl", tone === "good" && "text-good", tone === "bad" && "text-bad")}>{value}</p>
      <div className="mt-3 flex min-h-5 flex-wrap items-center gap-2 text-xs text-muted">
        {delta != null && Number.isFinite(delta) ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-medium",
              good === null ? "bg-surface-3 text-muted" : good ? "bg-good/15 text-good" : "bg-bad/15 text-bad",
            )}
            title="vs last month"
          >
            {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {formatPercent(Math.abs(delta))}
          </span>
        ) : null}
        {sub}
      </div>
      {progress ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(progress.ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={cn("h-full rounded-full", progress.status === "over" ? "bg-bad" : progress.status === "near" ? "bg-warn" : "bg-accent")}
            style={{ width: `${Math.min(100, progress.ratio * 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
