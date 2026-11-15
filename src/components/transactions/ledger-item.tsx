"use client";

import Link from "next/link";
import { CalendarClock, ExternalLink, Plane, Repeat } from "lucide-react";
import { useAppData } from "@/components/app-data";
import { Badge } from "@/components/ui/badge";
import { categoryColor } from "@/components/charts/colors";
import { formatMoney } from "@/lib/money";
import { formatDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { LedgerRow } from "@/lib/data/types";

export type LedgerRowWithLink = LedgerRow & { external_url?: string | null; notes?: string | null };

/** One ledger row. Tapping opens the parent transaction for editing. */
export function LedgerItem({ row, showDate = true, right, showKind = false, onOpen }: { row: LedgerRowWithLink; showDate?: boolean; /** Open a detail view instead of the edit form. */ onOpen?: (row: LedgerRowWithLink) => void; right?: React.ReactNode; /** Tag each row Regular or Trip (calendar day list). */ showKind?: boolean }) {
  const app = useAppData();
  const cat = app.maps.category.get(row.category_id);
  const sub = row.subcategory_id ? app.maps.subcategory.get(row.subcategory_id) : null;
  const trip = row.trip_id ? app.maps.trip.get(row.trip_id) : null;
  const title = row.is_lump ? `${row.description} (trip)` : row.merchant_name || row.description || sub?.name || cat?.name || "Transaction";
  const income = row.type === "income";
  const refund = row.type === "refund";
  const foreign = row.orig_currency && row.orig_currency !== app.currency;
  const linkHref = safeHttpUrl(row.external_url);
  // trips set to "not counted" are shown for context but left out of every total
  const uncounted = showKind && trip?.include_mode === "excluded";

  return (
    <div className="relative flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-surface-2">
      <button
        type="button"
        disabled={!row.txn_id}
        onClick={() => row.txn_id && (onOpen ? onOpen(row) : app.openTxnSheet({ id: row.txn_id }))}
        className="absolute inset-0 z-0 rounded-2xl disabled:cursor-default"
        aria-label={row.txn_id ? `Edit ${title}` : undefined}
      />
      <span className="pointer-events-none relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-surface-3">
        <span className="h-3 w-3 rounded-[4px]" style={{ background: categoryColor(cat) }} />
      </span>
      <span className="pointer-events-none relative z-10 min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
          {showDate ? <span>{formatDay(row.entry_date)}</span> : null}
          {showDate ? <span aria-hidden>·</span> : null}
          <span className="max-w-full truncate">{sub ? `${cat?.name} › ${sub.name}` : cat?.name}</span>
          {linkHref ? (
            <a
              href={linkHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open link for ${title}`}
              title="Open related link"
              className="pointer-events-auto inline-flex shrink-0 items-center gap-0.5 rounded-md px-1 py-0.5 font-medium text-accent transition hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent"
            >
              <ExternalLink size={11} />
              <span className="hidden sm:inline">Link</span>
            </a>
          ) : null}
          {row.installment_seq ? (
            showKind ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-plan">
                <Repeat size={11} />
                {row.installment_seq}/{row.installment_count}
              </span>
            ) : (
              <PlanBadge row={row} />
            )
          ) : null}
          {showKind && (income || refund) ? (
            <span className="inline-flex shrink-0 items-center rounded-full bg-income/15 px-2 py-0.5 font-medium text-income">{income ? "Income" : "Refund"}</span>
          ) : null}
          {showKind ? (
            trip ? (
              <span className="inline-flex min-w-0 shrink-0 items-center gap-1 rounded-full bg-trip/15 px-2 py-0.5 font-medium text-trip">
                <Plane size={11} className="shrink-0" />
                <span className="max-w-32 truncate">Trip: {trip.name}</span>
              </span>
            ) : (
              row.plan_kind ? (
                <span className="inline-flex shrink-0 items-center rounded-full bg-plan/15 px-2 py-0.5 font-medium text-plan">
                  {row.plan_kind === "emi" ? "EMI" : row.installment_seq ? "Spread" : "Paid upfront"}
                </span>
              ) : income || refund ? null : (
                <span className="inline-flex shrink-0 items-center rounded-full bg-expense/15 px-2 py-0.5 font-medium text-expense">Regular</span>
              )
            )
          ) : trip ? (
            <span className="inline-flex shrink-0 items-center gap-0.5">
              <Plane size={11} />
              {trip.name}
            </span>
          ) : null}
          {uncounted ? <span className="shrink-0 text-faint">not counted</span> : null}
          {row.is_scheduled ? (
            <Badge tone="warn" className="shrink-0 px-2 py-0">
              <CalendarClock size={11} />
              Scheduled
            </Badge>
          ) : null}
        </span>
      </span>
      {right ?? (
        <span className="pointer-events-none relative z-10 shrink-0 text-right">
          <span className={cn("num block text-sm font-medium", income && "text-good", refund && "text-good", uncounted && "text-muted line-through decoration-faint")}>
            {formatMoney(income || refund ? Math.abs(Number(row.amount)) : -Math.abs(Number(row.amount)), app.currency, { signed: true })}
          </span>
          {foreign && !row.installment_seq ? <span className="num block text-xs text-faint">{formatMoney(Number(row.orig_amount), row.orig_currency!)}</span> : null}
        </span>
      )}
    </div>
  );
}

/** "EMI 2/12" badge; links to that plan in the Plans & EMIs tab. */
export function PlanBadge({ row }: { row: LedgerRow }) {
  const badge = (
    <Badge tone={row.plan_kind === "emi" ? "warn" : "accent"} className="px-2 py-0">
      <Repeat size={11} />
      {row.plan_kind === "emi" ? "EMI" : "Spread"} {row.installment_seq}/{row.installment_count}
    </Badge>
  );
  if (!row.txn_id) return <span className="shrink-0">{badge}</span>;
  return (
    <Link href={`/transactions?tab=plans#plan-${row.txn_id}`} aria-label={`View plan: ${row.plan_kind === "emi" ? "EMI" : "Spread"} ${row.installment_seq} of ${row.installment_count}`} className="pointer-events-auto shrink-0 rounded-full hover:opacity-80 focus-visible:outline-2 focus-visible:outline-accent">
      {badge}
    </Link>
  );
}

function safeHttpUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname ? url.href : null;
  } catch {
    return null;
  }
}
