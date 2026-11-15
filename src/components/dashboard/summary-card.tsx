import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { InfoTitle } from "@/components/ui/info-title";
import { formatPercent } from "@/lib/money";
import { cn } from "@/lib/utils";

export type SummaryMetric = {
  label: string;
  /** Small lowercase note after the label, e.g. "for this month". */
  qualifier?: string;
  value: string;
  tone?: "good" | "bad";
  info?: ReactNode;
  /** Change vs last month as a ratio; `goodWhenUp` says whether an increase is good (income, net) or bad (spend). */
  delta?: number | null;
  goodWhenUp?: boolean;
  sub?: ReactNode;
  progress?: { ratio: number; status: "ok" | "near" | "over" | "none" };
};

/**
 * One card, four numbers: Income · Total spend · Core spend · Net.
 * 4 columns with hairline dividers on desktop, 2×2 on mobile. Each number carries its context:
 * change vs last month, a one-line note and (for spending) a budget bar.
 * The ⓘ panels float over the whole card.
 */
export function SummaryCard({ metrics, header }: { metrics: SummaryMetric[]; header?: ReactNode }) {
  return (
    <section aria-label="Financial summary" className="rounded-[var(--radius-card)] border border-border bg-surface">
      {header ? <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-border p-4 sm:px-5">{header}</div> : null}
      <div className="relative grid grid-cols-2 lg:grid-cols-4">
      {metrics.map((m, i) => {
        const up = (m.delta ?? 0) > 0;
        const good = m.delta == null || m.delta === 0 ? null : up === !!m.goodWhenUp;
        return (
          <div
            key={m.label}
            role="group"
            aria-label={m.label}
            className={cn(
              "flex min-w-0 flex-col p-4 sm:p-5 lg:border-t-0",
              i % 2 === 1 && "border-l border-border",
              i >= 2 && "border-t border-border",
              i > 0 && "lg:border-l lg:border-border",
            )}
          >
            <InfoTitle
              as="p"
              info={m.info}
              overlay
              className="text-xs font-medium uppercase tracking-wide text-muted"
              panelClassName="absolute inset-x-2 top-14 z-20 border border-border bg-surface-3 shadow-xl sm:inset-x-4"
            >
              {m.label}
              {m.qualifier ? <span className="ml-1 text-xs font-normal normal-case tracking-normal text-faint">{m.qualifier}</span> : null}
            </InfoTitle>
            <p className={cn("num mt-2 truncate text-2xl font-medium leading-none sm:text-3xl", m.tone === "good" && "text-good", m.tone === "bad" && "text-bad")}>{m.value}</p>
            <div className="mt-3 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              {m.delta != null && Number.isFinite(m.delta) ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-medium",
                    good === null ? "bg-surface-3 text-muted" : good ? "bg-good/15 text-good" : "bg-bad/15 text-bad",
                  )}
                  title="vs last month"
                >
                  {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {formatPercent(Math.abs(m.delta))}
                </span>
              ) : null}
              {m.sub}
            </div>
            <div className="mt-auto pt-3">
              {m.progress ? (
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label={`${m.label} against budget`} aria-valuenow={Math.round(m.progress.ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div
                    className={cn("h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none", m.progress.status === "over" ? "bg-bad" : m.progress.status === "near" ? "bg-warn" : "bg-accent")}
                    style={{ width: `${Math.min(100, m.progress.ratio * 100)}%` }}
                  />
                </div>
              ) : (
                <div className="h-1.5" aria-hidden />
              )}
            </div>
          </div>
        );
      })}
      </div>
    </section>
  );
}
