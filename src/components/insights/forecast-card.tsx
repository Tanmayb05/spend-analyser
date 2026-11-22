import { Card, CardHeader, Insight } from "@/components/ui/card";
import { StatStrip } from "@/components/cards/stat-strip";
import { ACCENT, NEUTRAL } from "@/components/charts/colors";
import { formatMoney } from "@/lib/money";
import type { Forecast } from "@/lib/analytics/insight-views";
import type { ReactNode } from "react";

const W = 600;
const H = 180;
const PAD = 6;

/** Month-end forecast: running spend against last month's, the projected finish and the budget line. Current month only. */
export function ForecastCard({ f, currency, info }: { f: Forecast; currency: string; info?: ReactNode }) {
  const money = (n: number) => formatMoney(n, currency, { whole: true });
  const top = Math.max(f.projected, f.budget, f.lastMonth.at(-1) ?? 0, f.posted, 1) * 1.08;
  const x = (day: number) => PAD + ((day - 1) / Math.max(f.days - 1, 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - (v / top) * (H - PAD * 2);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const nowPoint = f.cumulative.at(-1) ?? 0;

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
    { label: "Projected month end", value: f.early ? "–" : money(f.projected), note: f.budget > 0 && !f.early ? `${f.projected > f.budget ? "over" : "under"} budget` : undefined, noteTone: f.budget > 0 && !f.early ? (f.projected > f.budget ? ("bad" as const) : ("good" as const)) : undefined },
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
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img" aria-label={`Running spend this month: ${money(f.posted)} so far, projected ${money(f.projected)} by month end`} preserveAspectRatio="none">
        {f.budget > 0 ? <line x1={PAD} x2={W - PAD} y1={y(f.budget)} y2={y(f.budget)} stroke="var(--bad)" strokeWidth={1} strokeDasharray="2 4" vectorEffect="non-scaling-stroke" /> : null}
        <path d={line(f.lastMonth)} fill="none" stroke={NEUTRAL.mid} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {!f.early && f.daysLeft > 0 ? (
          <line x1={x(f.day)} y1={y(nowPoint)} x2={x(f.days)} y2={y(f.projected)} stroke={ACCENT} strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
        ) : null}
        <path d={line(f.cumulative)} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: ACCENT }} aria-hidden />This month</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed" style={{ borderColor: ACCENT }} aria-hidden />Projected</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: NEUTRAL.mid }} aria-hidden />Last month</span>
        {f.budget > 0 ? <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t border-dashed border-bad" aria-hidden />Budget {money(f.budget)}</span> : null}
      </div>
      <Insight>{headline}</Insight>
    </Card>
  );
}
