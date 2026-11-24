"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { InfoTitle } from "@/components/ui/info-title";
import { LedgerItem, type LedgerRowWithLink } from "@/components/transactions/ledger-item";
import { TxnDetail } from "@/components/transactions/txn-detail";
import { useBackSheet } from "@/hooks/use-back-nav";
import { useAppData } from "@/components/app-data";
import { useParamHref } from "@/components/dashboard/dashboard-header";
import { ScopeControl } from "@/components/dashboard/view-controls";
import { PeriodPicker } from "@/components/transactions/period-picker";
import type { Scope } from "@/lib/analytics/summary";
import { addMonths, daysInMonth, formatMonth, parseISO } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { LedgerRow } from "@/lib/data/types";

/** regular / plan / trip are spending; "in" is money coming back (income and refunds). */
type Kind = "regular" | "plan" | "trip" | "in";
type Day = {
  rows: LedgerRow[];
  /** net spending for the day: expenses minus refunds (what the totals use) */
  spent: number;
  /** expenses only, before refunds; drives the cell tint */
  gross: number;
  /** income plus refunds */
  inflow: number;
  has: Record<Kind, boolean>;
  kindSpend: Record<Kind, number>;
  /** the single biggest counted transaction of the day; its kind colours the cell */
  top: { kind: Kind; amount: number } | null;
};

/**
 * Heat scale: a day's spend picks one of 8 shades of its own colour (upper bound in the base currency, mix % of the colour over the card).
 * Kept quiet: the strongest shade tops out near 60%, so the donut stays the loudest thing on the page.
 */
const SHADES = [
  { max: 10, label: "0–10", pct: 8 },
  { max: 25, label: "11–25", pct: 14 },
  { max: 50, label: "26–50", pct: 21 },
  { max: 100, label: "51–100", pct: 28 },
  { max: 200, label: "101–200", pct: 36 },
  { max: 400, label: "201–400", pct: 44 },
  { max: 600, label: "401–600", pct: 52 },
  { max: Infinity, label: "600+", pct: 60 },
] as const;
const STRONG_FROM = 4; // shades from here on get full-strength ink for the figures, since muted text loses contrast on them
/** Each kind's colour ramp: shade 1 is `lo`, shade 8 is `hi` (all are CSS tokens, so they follow the theme). */
const RAMP: Record<Kind, { lo: string; hi: string }> = {
  regular: { lo: "--expense-lo", hi: "--expense" }, // pink -> red
  plan: { lo: "--plan-lo", hi: "--plan-hi" }, // pale blue -> accent blue
  trip: { lo: "--trip", hi: "--trip" },
  in: { lo: "--income-lo", hi: "--income" }, // mint -> green
};
const KINDS: Kind[] = ["regular", "plan", "trip", "in"];

const shadeOf = (amount: number) => SHADES.findIndex((s) => amount <= s.max);
/** Background for a cell: the kind's ramp colour for this shade, mixed over the card by the shade's strength. */
function heat(kind: Kind, shade: number) {
  const { lo, hi } = RAMP[kind];
  const t = Math.round((shade / (SHADES.length - 1)) * 100);
  return `color-mix(in oklab, color-mix(in oklab, var(${hi}) ${t}%, var(${lo})) ${SHADES[shade].pct}%, var(--surface-2))`;
}
/** Net for the day: money in (income + refunds) minus spending. Negative = spent more than came in. */
const netOf = (d: Day) => d.inflow - d.gross;
/** The day's biggest single transaction picks the colour (income, regular, EMI or trip). Mixed days still show every kind in the bar underneath. */
const cellKind = (d: Day): Kind | null => d.top?.kind ?? null;

const KIND_NAME = { regular: "regular", plan: "EMI or spread", trip: "trip", in: "income or refund" } as const;

const WEEK_LONG = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function longDay(d: string) {
  return parseISO(d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/**
 * The dashboard's main control. Owns month navigation (the `?m=` param is the single source of truth for the
 * whole page) and shows activity by day: pink to red = regular spending, blue = EMI or spread purchase, orange = trip,
 * green = income or refund, several = split bar. Darker = bigger amount.
 * Selecting a day lists its transactions underneath.
 */
export function CalendarCard({ month, today, rows, currency, weekStart, scope, info }: { month: string; today: string; rows: LedgerRow[]; currency: string; weekStart: number; scope: Scope; info?: ReactNode }) {
  const app = useAppData();
  const router = useRouter();
  const href = useParamHref();
  const detail = useBackSheet<LedgerRowWithLink>(); // Back closes the detail sheet
  const gridRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const days = daysInMonth(month);
  const thisMonth = `${today.slice(0, 7)}-01`;

  const byDay = useMemo(() => {
    const m = new Map<string, Day>();
    for (const r of rows) {
      const d = m.get(r.entry_date) ?? {
        rows: [],
        spent: 0,
        gross: 0,
        inflow: 0,
        has: { regular: false, plan: false, trip: false, in: false },
        kindSpend: { regular: 0, plan: 0, trip: 0, in: 0 },
        top: null,
      };
      d.rows.push(r);
      const trip = r.trip_id ? app.maps.trip.get(r.trip_id) : null;
      // trips marked "not counted" appear on the calendar but never add to a total
      const counted = trip?.include_mode !== "excluded";
      const inflow = r.type === "income" || r.type === "refund";
      const kind: Kind = inflow ? "in" : r.trip_id ? "trip" : r.plan_kind ? "plan" : "regular";
      if (counted) {
        const size = Math.abs(Number(r.type === "income" ? r.income : r.spend));
        if (!d.top || size > d.top.amount) d.top = { kind, amount: size };
        if (r.type === "income") {
          d.inflow += Number(r.income);
          d.kindSpend.in += Number(r.income);
        } else if (r.type === "refund") {
          d.inflow += -Number(r.spend);
          d.kindSpend.in += -Number(r.spend);
          d.spent += Number(r.spend); // negative: nets against the day's spending
        } else {
          d.spent += Number(r.spend);
          d.gross += Number(r.spend);
          d.kindSpend[kind] += Number(r.spend);
        }
      }
      d.has[kind] = true;
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
  const countedRows = [...byDay.values()].flatMap((d) => d.rows).filter((r) => !r.is_scheduled && !(r.trip_id && app.maps.trip.get(r.trip_id)?.include_mode === "excluded"));
  const monthTotal = countedRows.reduce((a, r) => a + Number(r.spend), 0);
  const monthIn = countedRows.reduce((a, r) => a + (r.type === "income" ? Number(r.income) : r.type === "refund" ? -Number(r.spend) : 0), 0);

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
          const tint = day ? cellKind(day) : null;
          const net = day ? netOf(day) : 0;
          const shade = day && tint ? shadeOf(Math.abs(net)) : 0;
          const strong = !!tint && shade >= STRONG_FROM;
          const kinds = day ? KINDS.filter((k) => day.has[k]).map((k) => KIND_NAME[k]) : [];
          const spoken = day ? [day.spent > 0 ? `${formatMoney(day.spent, currency)} spent` : "", day.inflow > 0 ? `${formatMoney(day.inflow, currency)} received` : "", day.inflow > 0 && day.gross > 0 ? `net ${formatMoney(net, currency, { signed: true })}` : ""].filter(Boolean) : [];
          return (
            <button
              key={d}
              type="button"
              data-day={n}
              onClick={() => setSelected(d)}
              aria-pressed={isSel}
              aria-current={isToday ? "date" : undefined}
              aria-label={`${longDay(d)}${day ? `: ${spoken.length ? `${spoken.join(", ")}, ` : ""}${kinds.join(" and ")} transactions` : ", no transactions"}`}
              // heat: 8 shades of the day's own colour (regular / EMI / trip / income) by amount
              style={tint ? { background: heat(tint, shade) } : undefined}
              className={cn(
                "flex h-14 flex-col items-center justify-between rounded-control px-0.5 py-1.5 text-sm outline-none transition-[background-color,filter] motion-reduce:transition-none sm:h-18 lg:h-20",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                // selected = ring around the whole tile (ink, so it also reads on blue EMI tiles)
                isSel && "ring-2 ring-text ring-offset-1 ring-offset-surface",
                !tint && (isSel ? "bg-surface-3" : "bg-surface-2 hover:bg-surface-3"),
                tint && "hover:brightness-110",
              )}
            >
              {/* today = a ring round the date, never a fill, so it cannot be mistaken for an EMI tile */}
              <span className={cn("grid h-6 min-w-6 place-items-center rounded-full px-1 leading-none text-text", isToday && "font-medium ring-1 ring-text")}>{n}</span>
              <span className={cn("money max-w-full truncate text-xs leading-none max-sm:hidden", strong ? "text-text" : "text-muted")}>{day && tint ? formatMoney(net, currency, { compact: true, signed: true }) : " "}</span>
              <span className="flex h-1 w-7 gap-px overflow-hidden rounded-full" aria-hidden>
                {day?.has.regular ? <span className="flex-1 bg-expense" /> : null}
                {day?.has.plan ? <span className="flex-1 bg-plan" /> : null}
                {day?.has.trip ? <span className="flex-1 bg-trip" /> : null}
                {day?.has.in ? <span className="flex-1 bg-income" /> : null}
              </span>
            </button>
          );
        })}
      </div>

      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
        <li className="inline-flex items-center gap-1.5"><span className="h-1 w-5 rounded-full bg-expense" />Regular</li>
        <li className="inline-flex items-center gap-1.5"><span className="h-1 w-5 rounded-full bg-plan" />EMI / spread</li>
        <li className="inline-flex items-center gap-1.5"><span className="h-1 w-5 rounded-full bg-trip" />Trip</li>
        <li className="inline-flex items-center gap-1.5"><span className="h-1 w-5 rounded-full bg-income" />Income / refund</li>
        <li className="inline-flex items-center gap-1.5"><span className="flex h-1 w-5 gap-px overflow-hidden rounded-full"><span className="flex-1 bg-expense" /><span className="flex-1 bg-plan" /><span className="flex-1 bg-trip" /><span className="flex-1 bg-income" /></span>Mixed</li>
        <li className="inline-flex items-center gap-1.5"><span className="num grid h-5 w-5 place-items-center rounded-full text-xs leading-none font-medium text-text ring-1 ring-text">{Number(today.slice(8, 10))}</span>Today</li>
        <li className="ml-auto inline-flex items-center gap-1.5" aria-hidden>
          less
          {SHADES.map((s, i) => (
            <span key={s.label} title={`${s.label} net`} className="h-2.5 w-2.5 rounded-sm" style={{ background: heat("regular", i) }} />
          ))}
          more
        </li>
      </ul>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-inset bg-surface-2 px-3 py-2.5">
          <dt className="text-muted">Daily average</dt>
          <dd className="money mt-1 truncate text-base text-text">{elapsed ? formatMoney(monthTotal / elapsed, currency, { whole: true }) : "–"}</dd>
          <dd className="mt-0.5 truncate text-faint">{daysWithSpend} active {daysWithSpend === 1 ? "day" : "days"}</dd>
        </div>
        {busiest ? (
          <button type="button" onClick={() => setSelected(busiest[0])} className="rounded-inset bg-surface-2 px-3 py-2.5 text-left outline-none transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-accent">
            <span className="block text-muted">Busiest day</span>
            <span className="money mt-1 block truncate text-base text-text">{formatMoney(busiest[1].spent, currency, { whole: true })}</span>
            <span className="mt-0.5 block truncate text-faint">{parseISO(busiest[0]).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          </button>
        ) : (
          <div className="rounded-inset bg-surface-2 px-3 py-2.5">
            <dt className="text-muted">Busiest day</dt>
            <dd className="money mt-1 text-base text-text">–</dd>
          </div>
        )}
      </dl>

      <div data-keep-selection className="mt-4 border-t border-border pt-4" aria-live="polite">
        {selected ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-medium">{longDay(selected)}</h3>
              <p className="text-sm text-muted">
                Total spent <span className="money ml-1 text-lg text-text">{formatMoney(sel?.spent ?? 0, currency)}</span>
                {sel && sel.inflow > 0 ? (
                  <>
                    <span className="mx-2 text-faint" aria-hidden>·</span>
                    Received <span className="money ml-1 text-lg text-income">{formatMoney(sel.inflow, currency)}</span>
                    <span className="mx-2 text-faint" aria-hidden>·</span>
                    Net <span className={cn("money ml-1 text-lg", netOf(sel) >= 0 ? "text-income" : "text-text")}>{formatMoney(netOf(sel), currency, { signed: true })}</span>
                  </>
                ) : null}
              </p>
            </div>
            {sel ? (
              <div className="mt-2 divide-y divide-border">
                {sel.rows.map((r, i) => (
                  <LedgerItem key={`${r.txn_id}-${r.installment_seq}-${i}`} row={r} showDate={false} showKind onOpen={detail.show} />
                ))}
              </div>
            ) : (
              <p className="py-4 text-sm text-muted">{scope === "core" ? "No everyday spending on this day." : "No transactions on this day."}</p>
            )}
          </>
        ) : (
          <p className="py-2 text-sm text-muted">
            <span className="money mr-1 text-lg text-text">{formatMoney(monthTotal, currency, { whole: true })}</span>
            spent
            {monthIn > 0 ? (
              <>
                {" "}and <span className="money mx-1 text-lg text-income">{formatMoney(monthIn, currency, { whole: true })}</span> received
              </>
            ) : null}{" "}
            in {formatMonth(month)}. Pick a day to see its transactions.
          </p>
        )}
      </div>
      <TxnDetail row={detail.value} onClose={detail.hide} />
    </Card>
  );
}
