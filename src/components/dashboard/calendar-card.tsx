"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { InfoTitle } from "@/components/ui/info-title";
import { LedgerItem } from "@/components/transactions/ledger-item";
import { useAppData } from "@/components/app-data";
import { useParamHref } from "@/components/dashboard/dashboard-header";
import { ScopeControl } from "@/components/dashboard/view-controls";
import { PeriodPicker } from "@/components/transactions/period-picker";
import type { Scope } from "@/lib/analytics/summary";
import { addMonths, daysInMonth, formatMonth, parseISO } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { LedgerRow } from "@/lib/data/types";

type Kind = "regular" | "plan" | "trip";
type Day = { rows: LedgerRow[]; spent: number; regular: boolean; trip: boolean; plan: boolean; kindSpend: Record<Kind, number> };

/** Heat scale: a day's spend picks one of 8 shades of its own colour (upper bound in the base currency, mix % of the colour over the card). */
const SHADES = [
  { max: 10, label: "0–10", pct: 10 },
  { max: 25, label: "11–25", pct: 18 },
  { max: 50, label: "26–50", pct: 27 },
  { max: 100, label: "51–100", pct: 37 },
  { max: 200, label: "101–200", pct: 48 },
  { max: 400, label: "201–400", pct: 59 },
  { max: 600, label: "401–600", pct: 70 },
  { max: Infinity, label: "600+", pct: 82 },
] as const;
const DARK_FROM = 5; // shades from here on are strong enough to need the on-accent text colour
const KIND_VAR: Record<Kind, string> = { regular: "--accent", plan: "--plan", trip: "--trip" };

const shadeOf = (spent: number) => SHADES.findIndex((s) => spent <= s.max);
/** The kind that carries most of the day's spend colours the cell (mixed days still show every kind in the bar underneath). */
function dominantKind(d: Day): Kind {
  return (["regular", "plan", "trip"] as const).reduce((best, k) => (d.kindSpend[k] > d.kindSpend[best] ? k : best), "regular" as Kind);
}

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
      const d = m.get(r.entry_date) ?? { rows: [], spent: 0, regular: false, trip: false, plan: false, kindSpend: { regular: 0, plan: 0, trip: 0 } };
      d.rows.push(r);
      const trip = r.trip_id ? app.maps.trip.get(r.trip_id) : null;
      // trips marked "not counted" appear on the calendar but never add to a total
      const kind: Kind = r.trip_id ? "trip" : r.plan_kind ? "plan" : "regular";
      if (trip?.include_mode !== "excluded") {
        d.spent += Number(r.spend);
        d.kindSpend[kind] += Number(r.spend);
      }
      d[kind] = true;
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
        <InfoTitle as="h2" info={info} className="card-title" panelClassName="max-w-md">Transaction calendar</InfoTitle>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker view="month" month={month} year={Number(month.slice(0, 4))} today={today} monthOnly />
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
          const shade = day && day.spent > 0 ? shadeOf(day.spent) : 0;
          const strong = !!day && day.spent > 0 && shade >= DARK_FROM;
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
              // heat: 8 shades of the day's own colour (regular / EMI / trip) by amount spent
              style={day && day.spent > 0 ? { background: `color-mix(in oklab, var(${KIND_VAR[dominantKind(day)]}) ${SHADES[shade].pct}%, var(--surface-2))` } : undefined}
              className={cn(
                "flex h-14 flex-col items-center justify-between rounded-xl px-0.5 py-1.5 text-sm outline-none transition motion-reduce:transition-none sm:h-[4.5rem] lg:h-20",
                "hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                isSel && "ring-2 ring-accent ring-offset-1 ring-offset-surface",
                !(day && day.spent > 0) && (isSel ? "bg-surface-3" : "bg-surface-2 hover:bg-surface-3"),
                day && day.spent > 0 && (strong ? "hover:brightness-110" : "hover:brightness-95"),
              )}
            >
              <span className={cn("grid h-6 min-w-6 place-items-center rounded-full px-1 leading-none", isToday ? (strong ? "bg-accent-fg font-medium text-text" : "bg-accent font-medium text-accent-fg") : strong ? "font-medium text-accent-fg" : "text-text")}>{n}</span>
              <span className={cn("num max-w-full truncate text-xs leading-none max-sm:hidden", strong ? "text-accent-fg/80" : "text-muted")}>{day && day.spent ? formatMoney(day.spent, currency, { compact: true }) : " "}</span>
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
        <li className="inline-flex items-center gap-1.5"><span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-xs leading-none font-medium text-accent-fg">{Number(today.slice(8, 10))}</span>Today</li>
        <li className="ml-auto inline-flex items-center gap-1.5" aria-hidden>
          less
          {SHADES.map((s) => (
            <span key={s.label} title={`${s.label} spent`} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: `color-mix(in oklab, var(--accent) ${s.pct}%, var(--surface-2))` }} />
          ))}
          more
        </li>
      </ul>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
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
