"use client";

import { useState } from "react";
import { CreditCard, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { deleteCardPayment } from "@/app/(app)/transactions/card-actions";
import { CardSettingsSheet, PaySheet, type CardSettings } from "./card-forms";
import { utilBand, type CardPayment, type CardSummary } from "@/lib/cards";
import { formatDay, formatMonth, relativeDays } from "@/lib/dates";
import { formatMoney, formatPercent } from "@/lib/money";
import { cn } from "@/lib/utils";

const toneVar = { good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)" } as const;

/** Horizontal meter of utilization with 30% guide tick. */
export function UtilMeter({ value, className }: { value: number; className?: string }) {
  const band = utilBand(value);
  return (
    <div className={cn("relative h-2.5 w-full overflow-hidden rounded-full bg-surface-3", className)} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label="Credit utilization">
      <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.min(100, value * 100)}%`, background: toneVar[band.tone] }} />
      <div className="absolute inset-y-0 w-px bg-text/40" style={{ left: "30%" }} title="30% guide" />
    </div>
  );
}

export function CardTile({ data, payments, settings, currency, today }: { data: CardSummary; payments: CardPayment[]; settings: CardSettings; currency: string; today: string }) {
  const [sheet, setSheet] = useState<"pay" | "edit" | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const a = useAction();
  const money = (n: number) => formatMoney(n, currency);
  const s = data.statement;
  const band = data.utilization !== null ? utilBand(data.utilization) : null;
  const histMax = Math.max(0.3, ...data.history.map((h) => h.utilization ?? 0));

  return (
    <Card className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-surface-3 text-muted"><CreditCard size={18} /></span>
          <div className="min-w-0">
            <p className="truncate font-medium">{data.card.name}</p>
            <p className="text-sm text-muted">{data.card.credit_limit ? `Limit ${formatMoney(data.card.credit_limit, currency, { whole: true })}` : "No limit set"}</p>
          </div>
        </div>
        <Button size="icon" variant="ghost" aria-label={`Edit ${data.card.name}`} onClick={() => setSheet("edit")}><Pencil size={16} /></Button>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Owed now</p>
          <p className="num mt-1 text-2xl font-medium">{money(data.outstanding)}</p>
        </div>
        {data.utilization !== null && band ? (
          <div className="text-right">
            <Badge tone={band.tone}>{band.label}</Badge>
            <p className="num mt-1 text-sm text-muted">{formatPercent(data.utilization)} used</p>
          </div>
        ) : null}
      </div>
      {data.utilization !== null ? <UtilMeter value={data.utilization} className="mt-3" /> : null}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {data.available !== null ? (<><dt className="text-muted">Available</dt><dd className="num text-right">{money(data.available)}</dd></>) : null}
        {data.cycle ? (<><dt className="text-muted">This cycle so far</dt><dd className="num text-right">{money(data.unbilled)}</dd></>) : null}
        {data.emiLocked > 0.005 ? (<><dt className="text-muted">EMI not yet billed</dt><dd className="num text-right">{money(data.emiLocked)}</dd></>) : null}
        {data.cycle ? (<><dt className="text-muted">Next statement</dt><dd className="text-right">{formatDay(data.cycle.closing)}</dd></>) : null}
      </dl>

      {s ? (
        <div className={cn("mt-4 rounded-2xl px-4 py-3", s.status === "overdue" ? "bg-bad/10" : s.status === "due" ? "bg-warn/10" : "bg-surface-2")}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm">
                Statement {formatDay(s.closing)} · <span className="num">{money(s.amount)}</span>
              </p>
              <p className="text-sm text-muted">
                {s.status === "paid"
                  ? s.amount > 0 ? `Paid · ${money(s.paid)}` : "Nothing to pay"
                  : `${money(s.remaining)} left · due ${formatDay(s.due)} (${relativeDays(s.due, today)})`}
              </p>
            </div>
            {s.status === "paid" ? <Badge tone="good">Paid</Badge> : <Badge tone={s.status === "overdue" ? "bad" : "warn"}>{s.status === "overdue" ? "Overdue" : "Due"}</Badge>}
          </div>
        </div>
      ) : !data.card.statement_day ? (
        <p className="mt-4 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">Add the statement and due day to see bills and reminders.</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant={s && s.status !== "paid" ? "accent" : "outline"} onClick={() => setSheet("pay")}>Mark payment</Button>
      </div>

      {data.utilization !== null && data.history.length > 1 ? (
        <div className="mt-5">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">Utilization by month end</p>
          <div className="relative flex h-20 items-end gap-1">
            <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border" style={{ bottom: `${(0.3 / histMax) * 100}%` }} />
            {data.history.map((h) => {
              const u = h.utilization ?? 0;
              return (
                <div key={h.month} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${formatMonth(h.month)}: ${formatPercent(u)} · ${money(h.balance)}`}>
                  <div className="mx-auto w-full max-w-7 rounded-t-md" style={{ height: `${Math.max(2, (Math.max(0, u) / histMax) * 100)}%`, background: toneVar[utilBand(u).tone], opacity: h.month.slice(0, 7) === today.slice(0, 7) ? 1 : 0.55 }} />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-1 text-[10px] text-faint">
            {data.history.map((h) => <span key={h.month} className="min-w-0 flex-1 truncate text-center">{formatMonth(h.month, "short").slice(0, 1)}</span>)}
          </div>
        </div>
      ) : null}

      {payments.length ? (
        <details className="mt-4">
          <summary className="cursor-pointer list-none text-sm text-muted">Payments · {payments.length} · tap to show</summary>
          <ul className="mt-2 divide-y divide-border">
            {payments.slice(0, 24).map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{formatDay(p.date)}{p.note ? <span className="text-muted"> · {p.note}</span> : null}</span>
                <span className="num">{money(p.amount)}</span>
                <Button
                  size={confirmId === p.id ? "sm" : "icon"}
                  variant="ghost"
                  className="text-bad"
                  aria-label={confirmId === p.id ? "Tap again to delete" : "Delete payment"}
                  onClick={() => (confirmId === p.id ? a.run(() => deleteCardPayment(p.id), () => setConfirmId(null)) : setConfirmId(p.id))}
                >
                  <Trash2 size={14} />
                  {confirmId === p.id ? "Confirm" : null}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {sheet === "pay" ? (
        <PaySheet cardId={data.card.id} cardName={data.card.name} suggested={s?.remaining ?? 0} outstanding={Math.max(0, data.outstanding)} open onClose={() => setSheet(null)} currency={currency} today={today} />
      ) : null}
      {sheet === "edit" ? <CardSettingsSheet card={settings} open onClose={() => setSheet(null)} currency={currency} today={today} /> : null}
    </Card>
  );
}
