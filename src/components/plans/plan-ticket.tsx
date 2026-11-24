"use client";

import { useAppData } from "@/components/app-data";
import { Badge } from "@/components/ui/badge";
import { categoryColor } from "@/components/charts/colors";
import { formatMoney } from "@/lib/money";
import { formatDay, relativeDays } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Punch } from "@/lib/plan-punches";

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
  punches: Punch[];
};

/** Half-circle cut into the ticket edge at the perforation. Painted in the page colour, clipped to the inside half. */
function Notch({ edge }: { edge: "top" | "bottom" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute right-[103px] size-5 rounded-full border border-border bg-bg",
        edge === "top" ? "-top-2.5 [clip-path:inset(50%_0_0_0)]" : "-bottom-2.5 [clip-path:inset(0_0_50%_0)]",
      )}
    />
  );
}

/**
 * A plan drawn as a punch card: one hole per installment (filled = paid, ringed = next due, hollow = still ahead),
 * with a stub across a perforated line that shows how many are punched and what is left.
 */
export function PlanTicket({ p }: { p: PlanView }) {
  const app = useAppData();
  const cat = app.maps.category.get(p.categoryId);
  const done = p.paidCount >= p.count;
  const left = Math.max(0, p.total - p.paid);
  return (
    <div className="relative">
      <button
        type="button"
        id={`plan-${p.txnId}`}
        onClick={() => app.openTxnSheet({ id: p.txnId })}
        className="flex w-full scroll-mt-24 rounded-card border border-border bg-surface text-left hover:bg-surface-2 target:border-accent"
      >
        <span className="flex min-w-0 flex-1 flex-col p-compact">
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: categoryColor(cat) }} />
            <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
            <Badge tone="neutral" className="shrink-0">{p.kind === "emi" ? "EMI" : "Spread"}</Badge>
          </span>
          <span role="img" aria-label={`${p.paidCount} of ${p.count} installments paid`} className="mt-3 flex flex-wrap gap-1.5">
            {p.punches.map((h) => (
              <span
                key={h.seq}
                aria-hidden
                title={`${h.seq}. ${formatDay(h.due)} · ${formatMoney(h.amount, app.currency)}`}
                className={cn(
                  "size-4 rounded-full",
                  h.state === "paid" && (done ? "bg-faint" : "bg-accent"),
                  h.state === "next" && "bg-surface ring-2 ring-accent",
                  h.state === "upcoming" && "bg-surface-3 ring-1 ring-inset ring-text/10",
                )}
              />
            ))}
          </span>
          <span className="mt-3 block text-xs text-muted">
            <span className="money">{formatMoney(p.perMonth, app.currency)}</span>/mo
            {done ? " · finished" : p.nextDue ? ` · next ${relativeDays(p.nextDue, app.today)}` : ""}
          </span>
          {p.lastDue ? <span className="mt-1 block text-xs text-faint">{done ? "Ended" : "Ends"} {formatDay(p.lastDue)}</span> : null}
        </span>
        <span className="flex w-28 shrink-0 flex-col items-center justify-center gap-1 border-l border-dashed border-border p-compact text-center">
          <span className="num-lg text-2xl font-medium leading-none">{p.paidCount}</span>
          <span className="text-xs text-muted">of {p.count} paid</span>
          <span className="mt-2 block text-xs text-muted">{done ? "Done" : "Left"}</span>
          {done ? null : <span className="money text-sm font-medium">{formatMoney(left, app.currency, { whole: true })}</span>}
        </span>
      </button>
      <Notch edge="top" />
      <Notch edge="bottom" />
    </div>
  );
}
