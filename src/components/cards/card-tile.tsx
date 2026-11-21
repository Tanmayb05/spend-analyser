"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
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
const ACTIVE_BAR = "var(--accent)";
const QUIET_BAR = "var(--chart-muted)";

/** Horizontal meter of utilization with 30% guide tick. */
export function UtilMeter({ value, className }: { value: number; className?: string }) {
  const band = utilBand(value);
  return (
    <div className={cn("relative h-2 w-full overflow-hidden rounded-inset bg-surface-3", className)} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label="Credit utilization">
      <div className="h-full rounded-inset transition-[width] duration-(--dur-base)" style={{ width: `${Math.min(100, value * 100)}%`, background: toneVar[band.tone] }} />
      <div className="absolute inset-y-0 w-px bg-text/40" style={{ left: "30%" }} title="30% guide" />
    </div>
  );
}

/** Payment card drawn in code: flat ink face, hairline inner frame, chip and contactless mark. No gradient, no glow. */
function CardFace({ name, limit, onEdit }: { name: string; limit: string | null; onEdit: () => void }) {
  return (
    <div className="relative flex aspect-[1.586/1] w-full flex-col justify-between rounded-card bg-text p-compact text-bg ring-1 ring-inset ring-bg/20">
      <span aria-hidden className="pointer-events-none absolute inset-2 rounded-inset border border-bg/15" />
      <div className="relative flex items-start justify-between gap-2">
        <p className="min-w-0 truncate font-medium">{name}</p>
        <Button size="icon" variant="ghost" className="-mr-2 -mt-2 h-9 w-9 text-bg hover:bg-bg/15" aria-label={`Edit ${name}`} onClick={onEdit}>
          <Pencil size={16} />
        </Button>
      </div>
      <div className="relative flex items-center gap-3 text-bg/60">
        <span aria-hidden className="relative block h-8 w-11 overflow-hidden rounded-inset bg-bg/25 ring-1 ring-inset ring-bg/40">
          <span className="absolute inset-y-0 left-1/3 w-px bg-bg/40" />
          <span className="absolute inset-y-0 right-1/3 w-px bg-bg/40" />
          <span className="absolute inset-x-0 top-1/2 h-px bg-bg/40" />
        </span>
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M8.5 8.5a5 5 0 0 1 0 7" />
          <path d="M12 6a9 9 0 0 1 0 12" />
          <path d="M15.5 3.5a13 13 0 0 1 0 17" />
        </svg>
      </div>
      <div className="relative">
        <p className="text-label text-bg/60">{limit ? "Limit" : "No limit set"}</p>
        {limit ? <p className="money text-lg">{limit}</p> : null}
      </div>
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
  const rows: [string, string, boolean][] = [];
  if (data.available !== null) rows.push(["Available", money(data.available), true]);
  if (data.cycle) rows.push(["This cycle so far", money(data.unbilled), true]);
  if (data.emiLocked > 0.005) rows.push(["EMI not yet billed", money(data.emiLocked), true]);
  if (data.cycle) rows.push(["Next statement", formatDay(data.cycle.closing), false]);

  return (
    <Card className="min-w-0">
      <div className="flex flex-col gap-card-lg sm:flex-row">
        <div className="w-full shrink-0 sm:w-72">
          <CardFace name={data.card.name} limit={data.card.credit_limit ? formatMoney(data.card.credit_limit, currency, { whole: true }) : null} onEdit={() => setSheet("edit")} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-label text-muted">Owed now</p>
              <p className="num-lg mt-1 text-2xl font-medium">{money(data.outstanding)}</p>
            </div>
            {data.utilization !== null && band ? (
              <div className="text-right">
                <Badge tone={band.tone}>{band.label}</Badge>
                <p className="num mt-1 text-sm text-muted">{formatPercent(data.utilization)} used</p>
              </div>
            ) : null}
          </div>
          {data.utilization !== null ? <UtilMeter value={data.utilization} className="mt-3" /> : null}
          {rows.length ? (
            <dl className="mt-4 text-sm">
              {rows.map(([k, v, isMoney]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 border-t border-border py-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className={isMoney ? "money" : "num"}>{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>

      {s ? (
        <div className="mt-card border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm">
                Statement {formatDay(s.closing)} · <span className="money">{money(s.amount)}</span>
              </p>
              <p className="text-sm text-muted">
                {s.status === "paid"
                  ? s.amount > 0 ? <>Paid · <span className="money">{money(s.paid)}</span></> : "Nothing to pay"
                  : <><span className="money">{money(s.remaining)}</span> left · due {formatDay(s.due)} ({relativeDays(s.due, today)})</>}
              </p>
              {s.status !== "paid" && s.minDue > 0 ? (
                <p className={cn("text-xs", s.paid >= s.minDue ? "text-muted" : s.status === "overdue" ? "text-bad" : "text-muted")}>
                  {s.paid >= s.minDue ? `Minimum ${money(s.minDue)} covered · pay in full to avoid interest` : `Minimum due ~${money(s.minDue)}${s.paid > 0 ? ` · ${money(s.minDue - s.paid)} more to cover it` : ""}`}
                </p>
              ) : null}
            </div>
            {s.status === "paid" ? <Badge tone="good">Paid</Badge> : <Badge tone={s.status === "overdue" ? "bad" : "warn"}>{s.status === "overdue" ? "Overdue" : "Due"}</Badge>}
          </div>
        </div>
      ) : !data.card.statement_day ? (
        <p className="mt-card border-t border-border pt-4 text-sm text-muted">Add the statement and due day to see bills and reminders.</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant={s && s.status !== "paid" ? "accent" : "outline"} onClick={() => setSheet("pay")}>Mark payment</Button>
      </div>

      {data.utilization !== null && data.history.length > 1 ? (
        <div className="mt-card border-t border-border pt-4">
          <p className="text-label mb-2 text-muted">Utilization by month end</p>
          <div className="relative flex h-20 items-end gap-1">
            <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border" style={{ bottom: `${(0.3 / histMax) * 100}%` }} title="30% guide" />
            {data.history.map((h) => {
              const u = h.utilization ?? 0;
              const current = h.month.slice(0, 7) === today.slice(0, 7);
              return (
                <div key={h.month} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${formatMonth(h.month)}: ${formatPercent(u)} · ${money(h.balance)}`}>
                  <div className="mx-auto w-full max-w-7 rounded-t-sm" style={{ height: `${Math.max(2, (Math.max(0, u) / histMax) * 100)}%`, background: current ? ACTIVE_BAR : QUIET_BAR }} />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-1 text-xs text-faint">
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
                <span className="money">{money(p.amount)}</span>
                <Button
                  size={confirmId === p.id ? "sm" : "icon"}
                  variant="ghost"
                  className="text-bad"
                  aria-label={confirmId === p.id ? "Tap again to delete" : "Delete payment"}
                  onClick={() => (confirmId === p.id ? a.run(() => deleteCardPayment(p.id), () => setConfirmId(null)) : setConfirmId(p.id))}
                >
                  <Trash2 size={16} />
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
