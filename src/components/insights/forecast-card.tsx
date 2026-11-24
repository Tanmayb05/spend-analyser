import { Card, CardHeader, Insight } from "@/components/ui/card";
import { StatStrip } from "@/components/cards/stat-strip";
import { ACCENT, NEUTRAL } from "@/components/charts/colors";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { expectedAt, flightPath, gapPhrase, paceNote, type GapTone } from "@/lib/analytics/flight-path";
import type { Forecast } from "@/lib/analytics/insight-views";
import type { ReactNode } from "react";

const W = 600;
const H = 180;
const PAD = 6;

const GAP_TEXT: Record<GapTone, string> = { good: "text-good", warn: "text-warn", bad: "text-bad", neutral: "text-text" };
const GAP_DOT: Record<GapTone, string> = { good: "bg-good", warn: "bg-warn", bad: "bg-bad", neutral: "bg-accent" };

/**
 * Month-end forecast as a flight path: the month runs from day 1 to the last day, a dot marks today, the dotted line is an even pace
 * (to the budget, else last month's total) and the solid line is what was actually spent. Current month only.
 */
export function ForecastCard({ f, currency, info }: { f: Forecast; currency: string; info?: ReactNode }) {
  const money = (n: number) => formatMoney(n, currency, { whole: true });
  const path = flightPath({ day: f.day, days: f.days, cumulative: f.cumulative, budget: f.budget, lastMonthTotal: f.lastMonth.at(-1) ?? 0, projected: f.projected, high: f.high, early: f.early });
  const top = path.top;
  const x = (day: number) => PAD + ((day - 1) / Math.max(f.days - 1, 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - (v / top) * (H - PAD * 2);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const hasRange = path.showProjection && f.high - f.low >= 1;
  const over = f.budget > 0 && f.projected > f.budget;
  const headline =
    f.early
      ? `Too early to project: ${f.day === 1 ? "only today's" : `only ${f.day} days of`} spending so far.`
      : f.budget > 0
        ? over
          ? `On this pace you finish ${money(f.projected - f.budget)} over your ${money(f.budget)} budget.${f.safePerDay != null && f.safePerDay > 0 ? ` Keeping to ${money(f.safePerDay)} a day for the rest of the month would hold it.` : ""}`
          : `On this pace you finish ${money(f.budget - f.projected)} under your ${money(f.budget)} budget.`
        : `On this pace you finish near ${money(f.projected)}. Set budgets in Settings to see how that compares.`;

  const stats = [
    { label: "Spent so far", value: money(f.posted), note: `day ${f.day} of ${f.days}` },
    { label: "Already booked", value: money(f.scheduledLeft), note: "EMIs and scheduled entries" },
    {
      label: "Projected month end",
      value: f.early ? "–" : money(f.projected),
      note: f.early ? undefined : hasRange ? `likely ${money(f.low)} to ${money(f.high)}` : f.budget > 0 ? `${f.projected > f.budget ? "over" : "under"} budget` : undefined,
      noteTone: f.early || hasRange || f.budget <= 0 ? undefined : f.projected > f.budget ? ("bad" as const) : ("good" as const),
    },
    {
      label: "Left per day on budget",
      value: f.safePerDay == null ? "–" : f.safePerDay < 0 ? `−${money(Math.abs(f.safePerDay))}` : money(f.safePerDay),
      note: f.safePerDay != null && f.safePerDay < 0 ? "already past budget" : f.daysLeft ? `${f.daysLeft} days left` : "last day",
      noteTone: f.safePerDay != null && f.safePerDay < 0 ? ("bad" as const) : undefined,
    },
  ];

  return (
    <Card>
      <CardHeader title="Where is this month heading?" subtitle="Spent so far, plus what is already booked, plus your everyday pace" info={info} />
      <StatStrip stats={stats} className="mb-4" />
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-muted">
          Day {f.day} of {f.days}
          {path.basis ? <span className="ml-2 text-faint">{paceNote(path.basis, path.target, money)}</span> : null}
        </p>
        {path.basis ? <p className={cn("num-lg text-lg font-medium", GAP_TEXT[path.tone])}>{gapPhrase(path.gap, money)}</p> : null}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img" aria-label={`Running spend this month: ${money(f.posted)} so far${path.basis ? `, ${gapPhrase(path.gap, money)}` : ""}${f.early ? "" : `, projected ${money(f.projected)} by month end`}`} preserveAspectRatio="none">
          <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {path.basis ? (
            <line x1={x(1)} y1={y(expectedAt(path.target, 1, f.days))} x2={x(f.days)} y2={y(path.target)} stroke={NEUTRAL.mid} strokeWidth={1.5} strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
          ) : null}
          {path.showProjection ? (
            <line x1={x(f.day)} y1={y(path.actual)} x2={x(f.days)} y2={y(f.projected)} stroke={ACCENT} strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
          ) : null}
          {hasRange ? (
            <line x1={x(f.days)} y1={y(f.high)} x2={x(f.days)} y2={y(f.low)} stroke={ACCENT} strokeWidth={8} strokeOpacity={0.25} vectorEffect="non-scaling-stroke" />
          ) : null}
          <path d={line(f.cumulative)} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* markers are HTML so the stretched SVG cannot squash them into ovals */}
        <span aria-hidden className={cn("absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface", GAP_DOT[path.tone])} style={{ left: `${(x(f.day) / W) * 100}%`, top: `${(y(path.actual) / H) * 100}%` }} />
        {path.showProjection ? (
          <span aria-hidden className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent bg-surface" style={{ left: `${(x(f.days) / W) * 100}%`, top: `${(y(f.projected) / H) * 100}%` }} />
        ) : null}
      </div>
      <div className="mt-1 flex justify-between text-xs text-faint" aria-hidden>
        <span>Day 1</span>
        <span>Day {f.days}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: ACCENT }} aria-hidden />Spent so far</span>
        {path.showProjection ? <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed" style={{ borderColor: ACCENT }} aria-hidden />Projected</span> : null}
        {hasRange ? <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-accent/25" aria-hidden />Likely range</span> : null}
        {path.basis ? <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dotted" style={{ borderColor: NEUTRAL.mid }} aria-hidden />Even pace</span> : null}
      </div>
      {f.histPace != null ? (
        <p className="mt-2 text-xs text-faint">
          Everyday pace blends this month ({formatMoney(f.thisPace, currency)} a day) with your last {f.histMonths === 1 ? "month" : `${f.histMonths} months`} ({formatMoney(f.histPace, currency)} a day){hasRange ? "; the range shows the quietest and busiest of those months" : ""}.
        </p>
      ) : null}
      <Insight>{headline}</Insight>
    </Card>
  );
}
