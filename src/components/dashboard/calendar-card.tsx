"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { InfoTitle } from "@/components/ui/info-title";
import { LedgerItem } from "@/components/transactions/ledger-item";
import { useAppData } from "@/components/app-data";
import { useParamHref } from "@/components/dashboard/dashboard-header";
import { ScopeControl } from "@/components/dashboard/view-controls";
import type { Scope } from "@/lib/analytics/summary";
import { addMonths, daysInMonth, formatMonth, parseISO } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { LedgerRow } from "@/lib/data/types";

type Day = { rows: LedgerRow[]; spent: number; regular: boolean; trip: boolean; plan: boolean };

const KIND_NAME = { regular: "regular", plan: "EMI or spread", trip: "trip" } as const;

const WEEK_LONG = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function longDay(d: string) {
  return parseISO(d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/**
 * The dashboard's main control. Owns month navigation (the `?m=` param is the single source of truth for the
 * whole page) and shows spending by day: a blue bar = regular spending, purple = EMI or spread purchase, orange = trip, several = split bar.
 * Selecting a day lists its transactions underneath.
 */
export function CalendarCard({ month, today, rows, currency, weekStart, scope, info }: { month: string; today: string; rows: LedgerRow[]; currency: string; weekStart: number; scope: Scope; info?: ReactNode }) {
  const app = useAppData();
  const router = useRouter();
  const href = useParamHref();
  const gridRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const days = daysInMonth(month);
  const thisMonth = `${today.slice(0, 7)}-01`;

  const byDay = useMemo(() => {
    const m = new Map<string, Day>();
    for (const r of rows) {
      if (r.type === "income") continue;
      const d = m.get(r.entry_date) ?? { rows: [], spent: 0, regular: false, trip: false, plan: false };
      d.rows.push(r);
      const trip = r.trip_id ? app.maps.trip.get(r.trip_id) : null;
      // trips marked "not counted" appear on the calendar but never add to a total
      if (trip?.include_mode !== "excluded") d.spent += Number(r.spend);
      if (r.trip_id) d.trip = true;
      else if (r.plan_kind) d.plan = true;
      else d.regular = true;
      m.set(r.entry_date, d);
    }
    return m;
  }, [rows, app.maps.trip]);

  const [selected, setSelected] = useState<string | null>(() => {
    if (today.slice(0, 7) === month.slice(0, 7)) return today;
    return [...byDay.keys()].sort().at(-1) ?? null;
  });

  const first = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).getDay();
  const lead = (first - weekStart + 7) % 7;
  const labels = Array.from({ length: 7 }, (_, i) => WEEK_LONG[(weekStart + i) % 7]);
  const monthTotal = [...byDay.values()].flatMap((d) => d.rows).filter((r) => !r.is_scheduled && !(r.trip_id && app.maps.trip.get(r.trip_id)?.include_mode === "excluded")).reduce((a, r) => a + Number(r.spend), 0);

  const sel = selected ? byDay.get(selected) : undefined;
  const maxDay = Math.max(1, ...[...byDay.values()].map((d) => d.spent));
  const busiest = [...byDay.entries()].filter(([, d]) => d.spent > 0).sort((a, b) => b[1].spent - a[1].spent)[0];
  // average over the days that have happened (the whole month once it is over)
  const elapsed = month === thisMonth ? Number(today.slice(8, 10)) : month < thisMonth ? days : 0;
  const daysWithSpend = [...byDay.values()].filter((d) => d.spent > 0).length;

  // arrow keys move between days; Tab/Enter/Space keep their native behaviour
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    const cur = Number((document.activeElement as HTMLElement | null)?.dataset.day);
    if (!step || !cur) return;
    const next = cur + step;
    if (next < 1 || next > days) return;
    e.preventDefault();
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus();
  }

  // click on dead space (not a button, link, input or the day's transaction list) clears the selected day
  function onCardClick(e: MouseEvent<HTMLDivElement>) {
    if (swiped.current) {
      // the click that trails a swipe must not select a day
      swiped.current = false;
      e.stopPropagation();
      return;
    }
    if ((e.target as HTMLElement).closest("button, a, input, label, [data-keep-selection]")) return;
    setSelected(null);
  }

  // horizontal touch swipe changes month; vertical movement stays a normal page scroll
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    swiped.current = false;
    swipe.current = e.pointerType === "mouse" ? null : { x: e.clientX, y: e.clientY };
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < 1.5 * Math.abs(dy)) return;
    swiped.current = true;
    router.push(href({ m: addMonths(month, dx < 0 ? 1 : -1).slice(0, 7) }), { scroll: false });
  }

  return (
    <Card
      className="flex touch-pan-y flex-col"
      onClickCapture={onCardClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (swipe.current = null)}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <InfoTitle as="h2" info={info} className="text-base font-medium" panelClassName="max-w-md">Transaction calendar</InfoTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-full border border-border bg-surface-2 p-1">
            <Link href={href({ m: addMonths(month, -1).slice(0, 7) })} scroll={false} aria-label="Previous month" className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-accent">
              <ChevronLeft size={18} />
            </Link>
            <label className="relative focus-within:rounded-full focus-within:outline-2 focus-within:outline-accent">
              <span className="block min-w-32 px-2 text-center text-sm font-medium sm:min-w-36">{formatMonth(month)}</span>
              <input
                type="month"
                aria-label="Pick month"
                value={month.slice(0, 7)}
                onChange={(e) => e.target.value && router.push(href({ m: e.target.value }), { scroll: false })}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            <Link href={href({ m: addMonths(month, 1).slice(0, 7) })} scroll={false} aria-label="Next month" className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-accent">
              <ChevronRight size={18} />
            </Link>
          </div>
          {month !== thisMonth ? (
            <Link href={href({ m: null })} scroll={false} className="rounded-full border border-border bg-surface-2 px-3.5 py-2 text-sm font-medium hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-accent">
              Today
            </Link>
          ) : null}
          <ScopeControl scope={scope} />
        </div>
      </div>

      <div ref={gridRef} onKeyDown={onKeyDown} className="grid grid-cols-7 gap-1 sm:gap-1.5" role="group" aria-label={`Spending by day, ${formatMonth(month)}`}>
        {labels.map((l) => (
          <span key={l} className="pb-1 text-center text-xs text-faint">
            <span className="sm:hidden">{l[0]}</span>
            <span className="max-sm:hidden">{l}</span>
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`l${i}`} aria-hidden />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const n = i + 1;
          const d = `${month.slice(0, 8)}${String(n).padStart(2, "0")}`;
          const day = byDay.get(d);
          const isSel = selected === d;
          const isToday = d === today;
          const kinds = day ? (["regular", "plan", "trip"] as const).filter((k) => day[k]).map((k) => KIND_NAME[k]) : [];
          return (
            <button
              key={d}
              type="button"
              data-day={n}
              onClick={() => setSelected(d)}
              aria-pressed={isSel}
              aria-current={isToday ? "date" : undefined}
              aria-label={`${longDay(d)}${day ? `: ${day.spent ? `${formatMoney(day.spent, currency)} spent, ` : ""}${kinds.join(" and ")} transactions` : ", no transactions"}`}
              // heat: busier days sit on a stronger tint; trips keep their own colour in the bar underneath
              style={!isSel && day && day.spent > 0 ? { background: `color-mix(in oklab, var(--accent) ${Math.round(8 + Math.sqrt(day.spent / maxDay) * 34)}%, var(--surface-2))` } : undefined}
              className={cn(
                "flex h-14 flex-col items-center justify-between rounded-xl px-0.5 py-1.5 text-sm outline-none transition motion-reduce:transition-none sm:h-[4.5rem] lg:h-20",
                "hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                isSel ? "bg-surface-3 ring-2 ring-accent" : "bg-surface-2 hover:bg-surface-3",
              )}
            >
              <span className={cn("grid h-6 min-w-6 place-items-center rounded-full px-1 leading-none", isToday ? "bg-accent font-medium text-accent-fg" : isSel ? "font-medium text-text" : "text-text")}>{n}</span>
              <span className="num max-w-full truncate text-[11px] leading-none text-muted max-sm:hidden">{day && day.spent ? formatMoney(day.spent, currency, { compact: true }) : " "}</span>
              <span className="flex h-1 w-7 gap-px overflow-hidden rounded-full" aria-hidden>
                {day?.regular ? <span className="flex-1 bg-accent" /> : null}
                {day?.plan ? <span className="flex-1 bg-plan" /> : null}
                {day?.trip ? <span className="flex-1 bg-trip" /> : null}
              </span>
            </button>
          );
        })}
      </div>

      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
        <li className="inline-flex items-center gap-1.5"><span className="h-1 w-5 rounded-full bg-accent" />Regular</li>
        <li className="inline-flex items-center gap-1.5"><span className="h-1 w-5 rounded-full bg-plan" />EMI / spread</li>
        <li className="inline-flex items-center gap-1.5"><span className="h-1 w-5 rounded-full bg-trip" />Trip</li>
        <li className="inline-flex items-center gap-1.5"><span className="flex h-1 w-5 gap-px overflow-hidden rounded-full"><span className="flex-1 bg-accent" /><span className="flex-1 bg-plan" /><span className="flex-1 bg-trip" /></span>Mixed</li>
        <li className="inline-flex items-center gap-1.5"><span className="grid h-4 w-4 place-items-center rounded-full bg-accent text-[9px] font-medium text-accent-fg">{Number(today.slice(8, 10))}</span>Today</li>
        <li className="ml-auto inline-flex items-center gap-1.5" aria-hidden>
          less
          {[8, 18, 30, 42].map((p) => (
            <span key={p} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: `color-mix(in oklab, var(--accent) ${p}%, var(--surface-2))` }} />
          ))}
          more
        </li>
      </ul>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl bg-surface-2 px-3 py-2.5">
          <dt className="text-muted">{scope === "core" ? "Everyday this month" : "This month"}</dt>
          <dd className="num mt-1 truncate text-base font-medium text-text">{formatMoney(monthTotal, currency, { whole: true })}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 px-3 py-2.5">
          <dt className="text-muted">Daily average</dt>
          <dd className="num mt-1 truncate text-base font-medium text-text">{elapsed ? formatMoney(monthTotal / elapsed, currency, { whole: true }) : "–"}</dd>
          <dd className="mt-0.5 truncate text-faint">{daysWithSpend} active {daysWithSpend === 1 ? "day" : "days"}</dd>
        </div>
        {busiest ? (
          <button type="button" onClick={() => setSelected(busiest[0])} className="rounded-xl bg-surface-2 px-3 py-2.5 text-left outline-none transition hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-accent">
            <span className="block text-muted">Busiest day</span>
            <span className="num mt-1 block truncate text-base font-medium text-text">{formatMoney(busiest[1].spent, currency, { whole: true })}</span>
            <span className="mt-0.5 block truncate text-faint">{parseISO(busiest[0]).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          </button>
        ) : (
          <div className="rounded-xl bg-surface-2 px-3 py-2.5">
            <dt className="text-muted">Busiest day</dt>
            <dd className="num mt-1 text-base font-medium text-text">–</dd>
          </div>
        )}
      </dl>

      <div data-keep-selection className="mt-4 border-t border-border pt-4" aria-live="polite">
        {selected ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-medium">{longDay(selected)}</h3>
              <p className="num text-sm text-muted">
                Total spent <span className="ml-1 text-lg font-medium text-text">{formatMoney(sel?.spent ?? 0, currency)}</span>
              </p>
            </div>
            {sel ? (
              <div className="mt-2 divide-y divide-border/60">
                {sel.rows.map((r, i) => (
                  <LedgerItem key={`${r.txn_id}-${r.installment_seq}-${i}`} row={r} showDate={false} showKind />
                ))}
              </div>
            ) : (
              <p className="py-4 text-sm text-muted">{scope === "core" ? "No everyday spending on this day." : "No transactions on this day."}</p>
            )}
          </>
        ) : (
          <p className="py-2 text-sm text-muted">
            <span className="num mr-1 text-lg font-medium text-text">{formatMoney(monthTotal, currency, { whole: true })}</span>
            spent in {formatMonth(month)}. Pick a day to see its transactions.
          </p>
        )}
      </div>
    </Card>
  );
}
