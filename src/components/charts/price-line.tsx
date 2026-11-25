"use client";

import { curveMonotoneX } from "d3-shape";
import { useReducedMotion } from "motion/react";
import { useMemo } from "react";
import { formatMoney } from "@/lib/money";
import { formatDay } from "@/lib/dates";
import { useYScale } from "./bklit/chart-context";
import { Grid } from "./bklit/grid";
import { LineChart, Line } from "./bklit/line-chart";
import { ChartTooltip } from "./bklit/tooltip";
import { XAxis } from "./bklit/x-axis";

type Point = { date: string; price: number; merchant?: string | null };

/** "YYYY-MM-DD" as local midnight (a bare ISO date parses as UTC and lands on the previous day west of UTC). */
const localDate = (d: string) => {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, day);
};

/**
 * Money labels on the left of the plot, one per grid row (BKlit ships no y-axis).
 * Named YAxis so the chart keeps it outside the series reveal clip, like its own axes.
 * The $0 baseline label is skipped: it would sit on top of the first x-axis date.
 */
function YAxis({ currency }: { currency: string }) {
  const yScale = useYScale();
  return (
    <g aria-hidden>
      {yScale.ticks(4).filter((t) => t > 0).map((t) => (
        <text
          key={t}
          x={-8}
          y={yScale(t)}
          dy="0.32em"
          textAnchor="end"
          fontSize={12}
          fontFamily="var(--font-mono), ui-monospace, monospace"
          style={{ fill: "var(--faint)" }}
        >
          {formatMoney(t, currency, { whole: Number.isInteger(t) })}
        </text>
      ))}
    </g>
  );
}
// BKlit sorts chart children by component name; set it explicitly so production minification keeps it
YAxis.displayName = "YAxis";

/**
 * Single-series price over time (BKlit line chart, restyled to app tokens).
 * Same props as the earlier hand-drawn SVG version, so reverting is one file.
 * The 1100ms reveal runs only when the user allows motion; glow and faded edges are off.
 */
export function PriceLine({ points, currency }: { points: Point[]; currency: string }) {
  const reduce = useReducedMotion();
  const data = useMemo(() => points.map((p) => ({ date: localDate(p.date), price: p.price, merchant: p.merchant ?? null, day: p.date })), [points]);
  const prices = points.map((p) => p.price);
  const label = points.length
    ? `Price over time: ${points.length} purchases from ${formatDay(points[0].date)} to ${formatDay(points.at(-1)!.date)}, ` +
      `low ${formatMoney(Math.min(...prices), currency)}, high ${formatMoney(Math.max(...prices), currency)}, latest ${formatMoney(points.at(-1)!.price, currency)}`
    : "Price over time: no purchases";

  return (
    <div role="img" aria-label={label}>
      <LineChart
        data={data}
        aspectRatio=""
        className="h-44"
        margin={{ top: 12, right: 12, bottom: 28, left: 52 }}
        animationDuration={reduce ? 0 : 1100}
        yDomainTween={!reduce}
      >
        <Grid numTicksRows={4} strokeDasharray="0" fadeHorizontal={false} />
        <YAxis currency={currency} />
        <Line dataKey="price" curve={curveMonotoneX} strokeWidth={2} fadeEdges={false} glow={false} showMarkers markers={{ radius: 4, fadeOnHover: false, enterBlur: 0 }} />
        <XAxis numTicks={4} />
        <ChartTooltip
          showDatePill={false}
          content={({ point }) => (
            <div className="px-3 py-2 text-xs">
              <p className="money font-medium">{formatMoney(Number(point.price), currency)}</p>
              <p className="text-muted">
                {formatDay(String(point.day))}
                {point.merchant ? ` · ${point.merchant}` : ""}
              </p>
            </div>
          )}
        />
      </LineChart>
    </div>
  );
}
