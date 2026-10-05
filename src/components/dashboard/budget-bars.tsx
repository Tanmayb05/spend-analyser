import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleAlert } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { BudgetStatus } from "@/lib/analytics/budgets";

export type BudgetRow = { id: string; name: string; color: string; spent: number; budget: number; status: BudgetStatus; href: string };

const STATUS = {
  over: { label: "Over", icon: CircleAlert, cls: "text-bad", bar: "bg-bad" },
  near: { label: "Near limit", icon: AlertTriangle, cls: "text-warn", bar: "bg-warn" },
  ok: { label: "On track", icon: CheckCircle2, cls: "text-good", bar: "bg-accent" },
  none: { label: "No budget", icon: CheckCircle2, cls: "text-faint", bar: "bg-faint" },
} as const;

export function BudgetBars({ rows, currency }: { rows: BudgetRow[]; currency: string }) {
  return (
    <ul className="space-y-4">
      {rows.map((r) => {
        const s = STATUS[r.status];
        const Icon = s.icon;
        const ratio = r.budget > 0 ? r.spent / r.budget : r.spent > 0 ? 1 : 0;
        return (
          <li key={r.id}>
            <Link href={r.href} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: r.color }} />
                  <span className="truncate">{r.name}</span>
                </span>
                <span className="num shrink-0 text-muted">
                  <span className="text-text">{formatMoney(r.spent, currency, { whole: true })}</span>
                  {r.budget > 0 ? ` / ${formatMoney(r.budget, currency, { whole: true })}` : ""}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <div className={cn("h-full rounded-full", s.bar)} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                </div>
                <span className={cn("inline-flex w-24 shrink-0 items-center justify-end gap-1 text-xs", s.cls)}>
                  <Icon size={13} />
                  {s.label}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
