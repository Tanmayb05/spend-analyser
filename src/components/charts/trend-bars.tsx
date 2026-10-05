"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { formatMonth } from "@/lib/dates";
import { compactNumber, niceTicks } from "./scale";

export type TrendPoint = { month: string; a: number; b?: number; href?: string };

/**
 * Paired monthly bars (one shared y-axis). Selected month is emphasized; others recede.
 * Hover / tap shows a tooltip with exact values.
 */
export function TrendBars({
  data,
  selected,
  currency,
  aLabel,
  bLabel,
  aColor,
  bColor,
  height = 200,
}: {
  data: TrendPoint[];
  selected: string;
  currency: string;
  aLabel: string;
  bLabel?: string;
  aColor: string;
  bColor?: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...data.flatMap((d) => [d.a, d.b ?? 0]));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const selectedIdx = data.findIndex((d) => d.month === selected);
  const active = hover ?? selectedIdx;
  const pair = bLabel !== undefined;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-4 text-xs text-muted">
        <LegendDot color={aColor} label={aLabel} />
        {pair ? <LegendDot color={bColor!} label={bLabel!} /> : null}
      </div>
      <div className="flex gap-2">
        {/* y axis */}
        <div className="relative w-9 shrink-0 text-right text-[11px] text-faint" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className="num absolute right-0 -translate-y-1/2" style={{ bottom: `${(t / top) * 100}%` }}>
              {compactNumber(t)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          {/* grid */}
          <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height }}>
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 h-px bg-[var(--grid)]" style={{ bottom: `${(t / top) * 100}%` }} />
            ))}
          </div>
          <div className="relative flex items-end" style={{ height }} onMouseLeave={() => setHover(null)}>
            {data.map((d, i) => {
              const emphasized = i === active;
              const Group = d.href ? Link : "div";
              return (
                <Group
                  key={d.month}
                  href={d.href ?? ""}
                  scroll={false}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  aria-label={`${formatMonth(d.month)}: ${aLabel} ${formatMoney(d.a, currency)}${pair ? `, ${bLabel} ${formatMoney(d.b ?? 0, currency)}` : ""}`}
                  className="flex h-full min-w-0 flex-1 items-end justify-center gap-[2px] px-[3px] outline-none"
                >
                  <Bar value={d.a} top={top} color={aColor} dim={!emphasized} />
                  {pair ? <Bar value={d.b ?? 0} top={top} color={bColor!} dim={!emphasized} /> : null}
                </Group>
              );
            })}
          </div>
          {/* x labels */}
          <div className="mt-2 flex">
            {data.map((d, i) => (
              <span key={d.month} className={cn("flex-1 text-center text-[11px]", i === active ? "text-text" : "text-faint", data.length > 8 && i % 2 === 1 && "max-sm:invisible")}>
                {formatMonth(d.month, "short")}
              </span>
            ))}
          </div>
          {/* tooltip */}
          {hover !== null && data[hover] ? (
            <div
              className="pointer-events-none absolute top-2 z-10 rounded-xl border border-border bg-surface-3 px-3 py-2 text-xs shadow-xl"
              style={{ left: `${Math.min(85, Math.max(15, ((hover + 0.5) / data.length) * 100))}%`, transform: "translate(-50%, -100%)" }}
            >
              <p className="mb-1 font-medium text-text">{formatMonth(data[hover].month)}</p>
              <p className="num text-muted">
                {aLabel}: <span className="text-text">{formatMoney(data[hover].a, currency, { whole: true })}</span>
              </p>
              {pair ? (
                <p className="num text-muted">
                  {bLabel}: <span className="text-text">{formatMoney(data[hover].b ?? 0, currency, { whole: true })}</span>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Bar({ value, top, color, dim }: { value: number; top: number; color: string; dim: boolean }) {
  const h = Math.max(0, (value / top) * 100);
  return (
    <div
      className="w-full max-w-4 rounded-t-[4px] transition-opacity"
      style={{ height: `${h}%`, minHeight: value > 0 ? 2 : 0, background: color, opacity: dim ? 0.35 : 1 }}
    />
  );
}

export function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
      {label}
    </span>
  );
}
