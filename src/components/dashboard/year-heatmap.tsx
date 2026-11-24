import type { CSSProperties, ReactNode } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { ScrollEnd } from "@/components/dashboard/scroll-end";
import { addDays, buildHeatGrid, dailySpend, HEAT_LEVELS } from "@/lib/analytics/heatmap";
import { formatMoney } from "@/lib/money";
import type { LedgerRow } from "@/lib/data/types";

const DAY_NAME = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** One accent hue in steps: the share of accent over the empty-day grey. Level 0 is the plain grey. */
const MIX = [0, 28, 50, 72, 100];

const tint = (level: number): CSSProperties => ({
  background: level ? `color-mix(in oklab, var(--accent) ${MIX[level]}%, var(--surface-3))` : "var(--surface-3)",
});

const shortDay = (d: string, endYear: string) => `${MONTH[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}${d.slice(0, 4) === endYear ? "" : `, ${d.slice(0, 4)}`}`;

/**
 * The last 12 months as a grid of days (a column per week, a row per weekday), each tinted by what was spent.
 * Takes whatever rows the page already loaded (the Transactions year view passes its filtered ones); `end` is the last day shown. Scrolls sideways on narrow screens.
 */
export function YearHeatmap({ rows, end, currency, weekStart, info, action }: { rows: LedgerRow[]; end: string; currency: string; weekStart: number; info?: ReactNode; action?: ReactNode }) {
  const grid = buildHeatGrid(dailySpend(rows, addDays(end, -400), end), end, weekStart);
  const endYear = end.slice(0, 4);
  const money = (n: number) => formatMoney(n, currency, { whole: true });
  const COL = 12; // square size in px; the gap below is 3px
  const gridStyle: CSSProperties = { gridTemplateColumns: `auto repeat(${grid.weeks.length}, ${COL}px)`, gridTemplateRows: `auto repeat(7, ${COL}px)`, columnGap: 3, rowGap: 3 };

  return (
    <Card>
      <CardHeader
        title="Spending through the year"
        subtitle={grid.activeDays ? `${money(grid.total)} over ${grid.activeDays} ${grid.activeDays === 1 ? "day" : "days"} in the last 12 months` : "Nothing spent in the last 12 months"}
        info={info}
        action={action}
      />
      <ScrollEnd label="Spending by day for the last 12 months" className="-mx-1 px-1 pb-1">
        <div className="grid w-max" style={gridStyle}>
          {grid.months.map((m) => (
            <span key={`${m.col}`} className="h-4 whitespace-nowrap text-xs leading-4 text-faint" style={{ gridRow: 1, gridColumn: m.col + 2 }} aria-hidden>
              {m.label}
              {m.label === "Jan" && m.col > 0 ? ` ${m.year}` : ""}
            </span>
          ))}
          {grid.rowDays.map((wd, r) =>
            r % 2 === 1 ? (
              <span key={wd} className="sticky left-0 bg-surface pr-2 text-xs leading-3 text-faint" style={{ gridRow: r + 2, gridColumn: 1 }} aria-hidden>
                {DAY_NAME[wd]}
              </span>
            ) : null,
          )}
          {grid.weeks.map((week, c) =>
            week.map((cell, r) => {
              if (!cell) return null;
              const text = `${shortDay(cell.date, endYear)}: ${cell.amount > 0 ? money(cell.amount) : "no spending"}`;
              return (
                <span
                  key={cell.date}
                  title={text}
                  role={cell.amount > 0 ? "img" : undefined}
                  aria-label={cell.amount > 0 ? text : undefined}
                  aria-hidden={cell.amount > 0 ? undefined : true}
                  className="rounded-sm"
                  style={{ ...tint(cell.level), gridRow: r + 2, gridColumn: c + 2 }}
                />
              );
            }),
          )}
        </div>
      </ScrollEnd>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-xs text-muted" aria-hidden>
        less
        {Array.from({ length: HEAT_LEVELS + 1 }, (_, l) => (
          <span key={l} className="size-3 rounded-sm" style={tint(l)} />
        ))}
        more
      </div>
    </Card>
  );
}
