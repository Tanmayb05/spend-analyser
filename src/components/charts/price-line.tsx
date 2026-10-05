"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";
import { formatDay } from "@/lib/dates";
import { niceTicks } from "./scale";

/** Single-series price over time: 2px line, 8px markers, hover tooltip, one y-axis from 0. */
export function PriceLine({ points, currency }: { points: { date: string; price: number; merchant?: string | null }[]; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 180;
  const pad = { l: 44, r: 12, t: 12, b: 24 };
  const ticks = niceTicks(Math.max(...points.map((p) => p.price), 0.01));
  const top = ticks.at(-1)!;
  const t0 = Date.parse(points[0].date);
  const t1 = Date.parse(points.at(-1)!.date);
  const x = (d: string) => pad.l + (t1 === t0 ? (W - pad.l - pad.r) / 2 : ((Date.parse(d) - t0) / (t1 - t0)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  const h = hover != null ? points[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Price over time" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} style={{ stroke: "var(--grid)" }} strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} style={{ fill: "var(--faint)" }}>
              {formatMoney(t, currency, { whole: t >= 10 })}
            </text>
          </g>
        ))}
        <path d={path} fill="none" strokeWidth={2} strokeLinejoin="round" style={{ stroke: "var(--c1)" }} />
        {points.map((p, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}>
            <circle cx={x(p.date)} cy={y(p.price)} r={12} fill="transparent" />
            <circle cx={x(p.date)} cy={y(p.price)} r={hover === i ? 6 : 4} strokeWidth={2} style={{ fill: "var(--c1)", stroke: "var(--surface)" }} />
          </g>
        ))}
      </svg>
      {h ? (
        <div className="pointer-events-none absolute top-0 rounded-xl border border-border bg-surface-3 px-3 py-2 text-xs" style={{ left: `${Math.min(80, Math.max(5, (x(h.date) / W) * 100))}%` }}>
          <p className="font-medium">{formatMoney(h.price, currency)}</p>
          <p className="text-muted">{formatDay(h.date)}{h.merchant ? ` · ${h.merchant}` : ""}</p>
        </div>
      ) : null}
    </div>
  );
}
