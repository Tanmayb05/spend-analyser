import Link from "next/link";
import { Card, CardHeader, Insight } from "@/components/ui/card";
import { formatMoney, formatPercent } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { CategoryMover } from "@/lib/analytics/insight-views";
import type { ReactNode } from "react";

export type MoverView = CategoryMover & { name: string; color: string; href: string };

const BAR = { over: "bg-bad", near: "bg-warn", ok: "bg-accent", none: "bg-faint" } as const;

/** Ruled list: category, this month vs a baseline (usual, last month or last year), and how much of the budget is used. Each row opens the matching transactions. */
export function CategoryMovers({ items, currency, info, takeaway, baseLabel, subtitle }: { items: MoverView[]; currency: string; info?: ReactNode; takeaway?: string; baseLabel: string; subtitle: string }) {
  const money = (n: number) => formatMoney(n, currency, { whole: true });
  return (
    <Card>
      <CardHeader title="What moved" subtitle={subtitle} info={info} />
      {items.length ? (
        <ul className="divide-y divide-border">
          {items.map((c) => {
            const pct = c.budget > 0 ? c.spent / c.budget : 0;
            return (
              <li key={c.categoryId}>
                <Link href={c.href} className="block py-3 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
                      <span className="truncate">{c.name}</span>
                    </span>
                    <span className="money shrink-0">{money(c.spent)}</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-3 text-xs text-muted">
                    <span className={cn(c.change != null && c.change >= 0.2 && "text-warn", c.change != null && c.change <= -0.2 && "text-good")}>
                      {c.change == null ? "No history to compare" : `${c.change >= 0 ? "+" : "−"}${formatPercent(Math.abs(c.change))} vs ${baseLabel} ${money(c.base)}`}
                    </span>
                    <span className="money">{c.budget > 0 ? `${formatPercent(pct)} of ${money(c.budget)}` : "No budget"}</span>
                  </div>
                  {c.budget > 0 ? (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-surface-3">
                      <div className={cn("h-full rounded-sm", BAR[c.status])} style={{ width: `${Math.min(pct, 1) * 100}%` }} />
                    </div>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">No spending to compare for this month</p>
      )}
      {takeaway ? <Insight>{takeaway}</Insight> : null}
    </Card>
  );
}
