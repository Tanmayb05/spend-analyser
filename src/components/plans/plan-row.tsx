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
    <button type="button" onClick={() => app.openTxnSheet({ id: p.txnId })} className="w-full rounded-2xl px-2 py-3 text-left hover:bg-surface-2">
      <div className="flex items-center gap-3">
        <span className="h-3 w-3 shrink-0 rounded-[4px]" style={{ background: categoryColor(cat) }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{p.name}</span>
          <span className="block truncate text-xs text-muted">
            {formatMoney(p.perMonth, app.currency)}/mo · {p.paidCount} of {p.count} {done ? "· finished" : p.nextDue ? `· next ${relativeDays(p.nextDue, app.today)}` : ""}
          </span>
        </span>
        <Badge tone={p.kind === "emi" ? "warn" : "accent"}>{p.kind === "emi" ? "EMI" : "Spread"}</Badge>
        <span className="num w-24 shrink-0 text-right text-sm">
          <span className="block font-medium">{formatMoney(p.total - p.paid, app.currency, { whole: true })}</span>
          <span className="block text-xs text-muted">left of {formatMoney(p.total, app.currency, { whole: true })}</span>
        </span>
      </div>
      <div className="ml-6 mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className={`h-full rounded-full ${done ? "bg-good" : "bg-accent"}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      {p.lastDue ? <p className="ml-6 mt-1 text-[11px] text-faint">Ends {formatDay(p.lastDue)}</p> : null}
    </button>
  );
}
