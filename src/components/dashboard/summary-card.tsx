import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { InfoTitle } from "@/components/ui/info-title";
import { formatPercent } from "@/lib/money";
import { cn } from "@/lib/utils";

export type SummaryMetric = {
  label: string;
  /** Kept for callers; the card header already names the month, so it is not drawn. */
  qualifier?: string;
  value: string;
  tone?: "good" | "bad";
  info?: ReactNode;
  /** Change vs last month as a ratio; `goodWhenUp` says whether an increase is good (income, net) or bad (spend). */
  delta?: number | null;
  goodWhenUp?: boolean;
  sub?: ReactNode;
  /** Kept for callers; stat tiles are numbers only, so no bar is drawn. */
  progress?: { ratio: number; status: "ok" | "near" | "over" | "none" };
};

/**
 * One card, four numbers: Income, Total spend, Everyday spend, Net savings.
 * Each tile is a label, a ledger figure and the change vs last month, plus one quiet line of context.
 * 4 columns with hairline dividers on desktop, 2x2 on mobile. The info panels float over the whole card.
 */
export function SummaryCard({ metrics, header }: { metrics: SummaryMetric[]; header?: ReactNode }) {
  return (
    <section aria-label="Financial summary" className="rounded-card border border-border bg-surface">
      {header ? <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-border p-compact sm:px-card">{header}</div> : null}
      <div className="relative grid grid-cols-2 lg:grid-cols-4">
        {metrics.map((m, i) => {
          const up = (m.delta ?? 0) > 0;
          const good = m.delta == null || m.delta === 0 ? null : up === !!m.goodWhenUp;
          const hasDelta = m.delta != null && Number.isFinite(m.delta);
          return (
            <div
              key={m.label}
              role="group"
              aria-label={m.label}
              className={cn(
                "flex min-w-0 flex-col p-compact sm:p-card lg:border-t-0",
                i % 2 === 1 && "border-l border-border",
                i >= 2 && "border-t border-border",
                i > 0 && "lg:border-l lg:border-border",
              )}
            >
              <InfoTitle
                as="p"
                info={m.info}
                overlay
                className="text-label text-muted"
                panelClassName="absolute inset-x-2 top-14 z-20 sm:inset-x-4"
              >
                {m.label}
              </InfoTitle>
              <p className={cn("num-lg mt-2 truncate text-2xl leading-none", m.tone === "good" && "text-good", m.tone === "bad" && "text-bad")}>{m.value}</p>
              <p className="mt-3 flex min-h-4 items-center gap-1 text-xs text-muted">
                {hasDelta ? (
                  <>
                    <span className={cn("num inline-flex items-center gap-0.5 font-medium", good === null ? "text-muted" : good ? "text-good" : "text-bad")}>
                      {up ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                      {formatPercent(Math.abs(m.delta as number))}
                    </span>
                    vs last month
                  </>
                ) : null}
              </p>
              <p className="mt-1 min-h-4 text-xs text-faint">{m.sub}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
