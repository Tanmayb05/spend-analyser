"use client";

import { useEffect, useRef } from "react";
import { Pencil } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/components/app-data";
import { categoryColor } from "@/components/charts/colors";
import { Cell } from "@/components/transactions/txn-detail";
import { DeleteTxnButton } from "@/components/transactions/delete-txn-button";
import { formatMoney } from "@/lib/money";
import { formatDay, relativeDays } from "@/lib/dates";
import { monogram } from "@/lib/monogram";
import { packFields, type GridField } from "@/lib/detail-grid";
import { cn } from "@/lib/utils";
import type { PlanView } from "./plan-ticket";

const STATE_LABEL = { paid: "Paid", next: "Next", upcoming: "Upcoming" } as const;

/**
 * A plan's own view: how far along it is and every installment with its date and state.
 * Delete and Edit sit here, so a click on a plan never drops straight into the edit form.
 */
export function PlanDetail({ plan, onClose }: { plan: PlanView | null; onClose: () => void }) {
  return (
    <Sheet open={Boolean(plan)} onClose={onClose} title="Plan" className="sm:max-w-xl">
      {plan ? <Body key={plan.txnId} p={plan} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Body({ p, onClose }: { p: PlanView; onClose: () => void }) {
  const app = useAppData();
  const cat = app.maps.category.get(p.categoryId);
  const emi = p.kind === "emi";
  const done = p.paidCount >= p.count;
  const left = Math.max(0, p.total - p.paid);
  const pct = p.total > 0 ? Math.min(100, Math.round((p.paid / p.total) * 100)) : 0;
  const listRef = useRef<HTMLDivElement>(null);

  // long schedules open scrolled to the next installment (after the dialog has laid out)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const list = listRef.current;
      const next = list?.querySelector<HTMLElement>("[data-next]");
      if (list && next) list.scrollTop = Math.max(0, next.offsetTop - list.clientHeight / 3);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const fields: (GridField & { label: string; node: React.ReactNode })[] = [
    { key: "pm", label: "Per month", node: <span className="money">{formatMoney(p.perMonth, app.currency)}</span> },
    { key: "paid", label: "Paid so far", node: <span className="money">{formatMoney(p.paid, app.currency)}</span> },
    { key: "total", label: emi ? "Total to pay" : "Total counted", node: <span className="money">{formatMoney(p.total, app.currency)}</span> },
    { key: "buy", label: emi ? "Purchase" : "Paid upfront", node: <><span className="money">{formatMoney(p.purchaseAmount, app.currency)}</span> · {formatDay(p.purchaseDate)}</> },
  ];
  if (p.interest > 0) fields.push({ key: "int", label: "Interest", node: <span className="money">{formatMoney(p.interest, app.currency)}</span> });
  const spans = new Map(packFields(fields).map((f) => [f.key, f.span]));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-full border border-border text-sm font-medium"
            style={{ background: `color-mix(in srgb, ${categoryColor(cat)} 24%, var(--surface-3))` }}
          >
            {monogram(p.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-medium">{p.name}</p>
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
              <span className="size-2 shrink-0 rounded-full" style={{ background: categoryColor(cat) }} aria-hidden />
              <span className="truncate">{cat?.name}</span>
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="num-lg text-2xl font-medium">{formatMoney(done ? p.total : left, app.currency, { whole: true })}</p>
          <p className="text-xs text-muted">{done ? "in total" : "left to go"}</p>
          <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
            {done ? <Badge tone="good">Finished</Badge> : null}
            <Badge tone={emi ? "warn" : "accent"}>{emi ? "EMI" : "Paid upfront"}</Badge>
          </div>
        </div>
      </div>

      <div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Plan progress" className="h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div className={cn("h-full rounded-full", done ? "bg-faint" : "bg-accent")} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 flex justify-between gap-3 text-xs text-muted">
          <span>{p.paidCount} of {p.count} {emi ? "paid" : "counted"}</span>
          <span>{done ? "Ended" : "Ends"} {p.lastDue ? formatDay(p.lastDue) : "-"}</span>
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-control border border-border bg-border">
        {fields.map((f) => (
          <Cell key={f.key} label={f.label} span={spans.get(f.key) ?? 1}>
            {f.node}
          </Cell>
        ))}
      </dl>

      <div>
        <p className="mb-2 text-sm font-medium">Schedule</p>
        <div ref={listRef} className="relative max-h-64 divide-y divide-border overflow-y-auto overscroll-contain rounded-control border border-border">
          {p.punches.map((h) => (
            <div key={h.seq} data-next={h.state === "next" ? "" : undefined} className={cn("flex items-center gap-3 px-3 py-2 text-sm", h.state === "next" && "bg-accent/10")}>
              <span
                aria-hidden
                className={cn(
                  "size-3 shrink-0 rounded-full",
                  h.state === "paid" && (done ? "bg-faint" : "bg-accent"),
                  h.state === "next" && "bg-surface ring-2 ring-accent",
                  h.state === "upcoming" && "bg-surface-3 ring-1 ring-inset ring-text/10",
                )}
              />
              <span className="w-7 shrink-0 text-muted">{h.seq}</span>
              <span className="min-w-0 flex-1 truncate">
                {formatDay(h.due)}
                {h.state === "next" ? <span className="text-muted"> · {relativeDays(h.due, app.today)}</span> : null}
              </span>
              <span className="text-xs text-muted">{STATE_LABEL[h.state]}</span>
              <span className="money w-24 shrink-0 text-right">{formatMoney(h.amount, app.currency)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <DeleteTxnButton txnId={p.txnId} what="plan" onDeleted={onClose} />
        <Button variant="ghost" className="flex-1" onClick={onClose}>Close</Button>
        <Button
          className="flex-1"
          onClick={() => {
            onClose();
            app.openTxnSheet({ id: p.txnId });
          }}
        >
          <Pencil size={16} /> Edit
        </Button>
      </div>
    </div>
  );
}
