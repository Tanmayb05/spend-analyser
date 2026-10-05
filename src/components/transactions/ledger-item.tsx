"use client";

import { CalendarClock, Plane, Repeat } from "lucide-react";
import { useAppData } from "@/components/app-data";
import { categoryColor } from "@/components/charts/colors";
import { formatMoney } from "@/lib/money";
import { formatDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { LedgerRow } from "@/lib/data/types";

/** One ledger row. Tapping opens the parent transaction for editing. */
export function LedgerItem({ row, showDate = true, right }: { row: LedgerRow; showDate?: boolean; right?: React.ReactNode }) {
  const app = useAppData();
  const cat = app.maps.category.get(row.category_id);
  const sub = row.subcategory_id ? app.maps.subcategory.get(row.subcategory_id) : null;
  const trip = row.trip_id ? app.maps.trip.get(row.trip_id) : null;
  const title = row.is_lump ? `${row.description} (trip)` : row.merchant_name || row.description || sub?.name || cat?.name || "Transaction";
  const income = row.type === "income";
  const refund = row.type === "refund";
  const foreign = row.orig_currency && row.orig_currency !== app.currency;

  return (
    <button
      type="button"
      disabled={!row.txn_id}
      onClick={() => row.txn_id && app.openTxnSheet({ id: row.txn_id })}
      className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-surface-3">
        <span className="h-3 w-3 rounded-[4px]" style={{ background: categoryColor(cat) }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="flex items-center gap-1.5 truncate text-xs text-muted">
          {showDate ? <span>{formatDay(row.entry_date)}</span> : null}
          {showDate ? <span aria-hidden>·</span> : null}
          <span className="truncate">{sub ? `${cat?.name} › ${sub.name}` : cat?.name}</span>
          {row.installment_seq ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-accent">
              <Repeat size={11} />
              {row.installment_seq}/{row.installment_count}
            </span>
          ) : null}
          {trip ? (
            <span className="inline-flex shrink-0 items-center gap-0.5">
              <Plane size={11} />
              {trip.name}
            </span>
          ) : null}
          {row.is_scheduled ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-warn">
              <CalendarClock size={11} />
              scheduled
            </span>
          ) : null}
        </span>
      </span>
      {right ?? (
        <span className="shrink-0 text-right">
          <span className={cn("num block text-sm font-medium", income && "text-good", refund && "text-good")}>
            {income || refund ? "+" : ""}
            {formatMoney(Number(row.amount), app.currency)}
          </span>
          {foreign && !row.installment_seq ? <span className="num block text-xs text-faint">{formatMoney(Number(row.orig_amount), row.orig_currency!)}</span> : null}
        </span>
      )}
    </button>
  );
}
