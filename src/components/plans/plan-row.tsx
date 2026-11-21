"use client";

import { useAppData } from "@/components/app-data";
import { Badge } from "@/components/ui/badge";
import { categoryColor } from "@/components/charts/colors";
import { formatMoney } from "@/lib/money";
import { formatDay, relativeDays } from "@/lib/dates";

export type PlanView = {
  txnId: string;
  name: string;
  categoryId: string;
  kind: "spread" | "emi";
  total: number;
  paid: number;
  paidCount: number;
  count: number;
  perMonth: number;
  nextDue: string | null;
  lastDue: string | null;
};

export function PlanRow({ p }: { p: PlanView }) {
  const app = useAppData();
  const cat = app.maps.category.get(p.categoryId);
  const ratio = p.total ? p.paid / p.total : 0;
  const done = p.paidCount >= p.count;
  return (
    <div className="border-t border-border">
      <button type="button" id={`plan-${p.txnId}`} onClick={() => app.openTxnSheet({ id: p.txnId })} className="my-1 block w-full scroll-mt-24 rounded-control px-2 py-2 text-left hover:bg-surface-2 target:bg-surface-3">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: categoryColor(cat) }} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{p.name}</span>
            <span className="block truncate text-xs text-muted">
              <span className="money">{formatMoney(p.perMonth, app.currency)}</span>/mo · {p.paidCount} of {p.count} {done ? "· finished" : p.nextDue ? `· next ${relativeDays(p.nextDue, app.today)}` : ""}
            </span>
          </span>
          <Badge tone="neutral" className="hidden sm:inline-flex">{p.kind === "emi" ? "EMI" : "Spread"}</Badge>
          <span className="w-24 shrink-0 text-right text-sm">
            <span className="money block font-medium">{formatMoney(p.total - p.paid, app.currency, { whole: true })}</span>
            <span className="block text-xs text-muted">left of <span className="money">{formatMoney(p.total, app.currency, { whole: true })}</span></span>
          </span>
        </div>
        <div className="ml-6 mt-2 h-1.5 overflow-hidden rounded-inset bg-surface-3">
          <div className={`h-full rounded-inset ${done ? "bg-faint" : "bg-accent"}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
        </div>
        {p.lastDue ? <p className="ml-6 mt-1 text-xs text-faint">Ends {formatDay(p.lastDue)}</p> : null}
      </button>
    </div>
  );
}
