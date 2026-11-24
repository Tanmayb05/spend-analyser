import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { MoverView } from "@/components/insights/category-movers";
import type { ReactNode } from "react";

const FILL = { over: "bg-bad", near: "bg-warn", ok: "bg-accent", none: "bg-faint" } as const;
const TICKS = [0.25, 0.5, 0.75];

/**
 * One upright gauge per budgeted category: the tube is the budget, the fill is what is spent. Ticks mark each quarter and the
 * 80% line where "near the limit" starts. Fullest first. The fill stays accent until a budget is near or over, then warn or bad.
 */
export function BudgetGauges({ items, currency, info, subtitle }: { items: MoverView[]; currency: string; info?: ReactNode; subtitle: string }) {
  const money = (n: number) => formatMoney(n, currency, { whole: true });
  const gauges = items.filter((c) => c.budget > 0).sort((a, b) => b.spent / b.budget - a.spent / a.budget);
  if (!gauges.length) return null;
  return (
    <Card>
      <CardHeader title="Budgets" subtitle={subtitle} info={info} />
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-x-3 gap-y-6">
        {gauges.map((c) => {
          const ratio = c.spent / c.budget;
          const pct = Math.round(ratio * 100);
          const over = ratio > 1;
          return (
            <li key={c.categoryId}>
              <Link href={c.href} className="group flex flex-col items-center gap-2 rounded-control p-1 hover:bg-surface-2" title={`${c.name}: ${money(c.spent)} of ${money(c.budget)}`}>
                <span className="num text-sm font-medium" aria-label={`${pct}% of budget used`}>
                  {pct}%
                </span>
                <span
                  role="meter"
                  aria-label={`${c.name} budget`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(100, pct)}
                  className={cn("relative h-32 w-9 overflow-hidden rounded-inset bg-surface-3", over && "ring-1 ring-bad")}
                >
                  <span className={cn("absolute inset-x-0 bottom-0 transition-[height] duration-(--dur-slow)", FILL[c.status])} style={{ height: `${Math.min(1, ratio) * 100}%` }} />
                  {TICKS.map((t) => (
                    <span key={t} aria-hidden className="absolute left-0 h-px w-2 bg-text/30" style={{ bottom: `${t * 100}%` }} />
                  ))}
                  <span aria-hidden className="absolute inset-x-0 h-px bg-warn/70" style={{ bottom: "80%" }} />
                </span>
                <span className="flex w-full min-w-0 items-center justify-center gap-1.5 text-xs">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
                  <span className="truncate">{c.name}</span>
                </span>
                <span className="money text-xs text-muted">
                  {over ? `${money(c.spent - c.budget)} over` : `${money(c.budget - c.spent)} left`}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-faint">Ticks mark every 25%. The amber line at 80% is where a category counts as near its limit.</p>
    </Card>
  );
}
