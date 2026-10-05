"use client";

import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/card";
import { LedgerItem } from "@/components/transactions/ledger-item";
import { daysInMonth, formatDay, formatMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { LedgerRow } from "@/lib/data/types";

/** Month grid; days with spending get a dot. Tap a day to see its total and entries. */
export function CalendarCard({ month, today, rows, currency, weekStart }: { month: string; today: string; rows: LedgerRow[]; currency: string; weekStart: number }) {
  const days = daysInMonth(month);
  const byDay = useMemo(() => {
    const m = new Map<string, LedgerRow[]>();
    for (const r of rows) {
      if (r.type === "income") continue;
      const l = m.get(r.entry_date) ?? [];
      l.push(r);
      m.set(r.entry_date, l);
    }
    return m;
  }, [rows]);
  const defaultDay = today.slice(0, 7) === month.slice(0, 7) ? today : null;
  const [selected, setSelected] = useState<string | null>(defaultDay);

  const first = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).getDay();
  const lead = (first - weekStart + 7) % 7;
  const labels = weekStart === 1 ? ["M", "T", "W", "T", "F", "S", "S"] : ["S", "M", "T", "W", "T", "F", "S"];
  const max = Math.max(1, ...[...byDay.values()].map((l) => l.reduce((a, r) => a + Number(r.spend), 0)));

  const sel = selected ? byDay.get(selected) ?? [] : [];
  const selTotal = sel.reduce((a, r) => a + Number(r.spend), 0);
  const monthTotal = [...byDay.values()].flat().filter((r) => !r.is_scheduled).reduce((a, r) => a + Number(r.spend), 0);

  return (
    <Card className="flex flex-col">
      <p className="mb-3 text-center font-medium">{formatMonth(month)}</p>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-faint">
        {labels.map((l, i) => (
          <span key={i} className="py-1">{l}</span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`l${i}`} className="aspect-square rounded-xl bg-[repeating-linear-gradient(135deg,var(--surface-2)_0_4px,transparent_4px_8px)]" />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const d = `${month.slice(0, 8)}${String(i + 1).padStart(2, "0")}`;
          const list = byDay.get(d);
          const spent = list?.reduce((a, r) => a + Number(r.spend), 0) ?? 0;
          const isSel = selected === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setSelected(isSel ? null : d)}
              aria-label={`${formatDay(d)}${spent ? `: ${formatMoney(spent, currency)}` : ""}`}
              aria-pressed={isSel}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition",
                isSel ? "bg-accent text-accent-fg" : "bg-surface-2 text-text hover:bg-surface-3",
                d === today && !isSel && "ring-1 ring-accent",
              )}
            >
              {i + 1}
              {spent > 0 ? (
                <span
                  className={cn("absolute bottom-1 h-1 rounded-full", isSel ? "bg-accent-fg" : "bg-accent")}
                  style={{ width: `${Math.max(4, Math.min(18, (spent / max) * 18))}px` }}
                />
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-surface-2 p-4">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-surface-3 text-muted">
          <CalendarDays size={18} />
        </span>
        <div className="min-w-0">
          <p className="num text-3xl font-medium leading-none">{formatMoney(selected ? selTotal : monthTotal, currency, { whole: true })}</p>
          <p className="mt-1 text-xs text-muted">{selected ? `${formatDay(selected)} · ${sel.length} ${sel.length === 1 ? "entry" : "entries"}` : "Spent this month · tap a day"}</p>
        </div>
      </div>
      {selected && sel.length ? (
        <div className="mt-2 max-h-56 overflow-y-auto">
          {sel.map((r, i) => (
            <LedgerItem key={`${r.txn_id}-${r.installment_seq}-${i}`} row={r} showDate={false} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}
