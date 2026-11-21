"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { formatMonth } from "@/lib/dates";

export type NetPoint = { month: string; net: number; active: boolean; href?: string };

/**
 * Compact diverging bars: income minus spending per month. Above the zero line = saved, below = overspent.
 * One accent: every month sits in a neutral step, the selected (or hovered) month takes the accent
 * (red when it overspent). Hover shows the exact value.
 * `variant="spend"` reuses the same look for a plain spending series: bars from the baseline, `net` = amount spent.
 */
export function NetBars({
  data,
  selected,
  currency,
  height = 104,
  variant = "net",
}: {
  data: NetPoint[];
  selected: string;
  currency: string;
  height?: number;
  variant?: "net" | "spend";
}) {
  const spend = variant === "spend";
  const [hover, setHover] = useState<number | null>(null);
  const maxPos = Math.max(0, ...data.filter((d) => d.active).map((d) => d.net));
  const maxNeg = Math.max(0, ...data.filter((d) => d.active).map((d) => -d.net));
  // one shared scale; the zero line sits where the data needs it
  const span = maxPos + maxNeg || 1;
  const posShare = maxPos + maxNeg > 0 ? maxPos / span : 0.5;
  const selectedIdx = data.findIndex((d) => d.month === selected);
  const active = hover ?? selectedIdx;
  const h = data[active];

  return (
    // `height` is the minimum plot height; inside a taller flex parent the bars grow to fill it
    <div className="flex h-full flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col" onMouseLeave={() => setHover(null)}>
        <div className="relative flex flex-1" style={{ minHeight: height }}>
          <div className="pointer-events-none absolute inset-x-0 h-px bg-[var(--grid)]" style={{ top: `${posShare * 100}%` }} />
          {data.map((d, i) => {
            const emphasized = i === active;
            const Group = d.href ? Link : "div";
            const linkProps = d.href ? { href: d.href, scroll: false } : {};
            const len = d.active ? (Math.abs(d.net) / span) * 100 : 0;
            const pos = d.net >= 0;
            return (
              <Group
                key={d.month}
                {...(linkProps as { href: string })}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                aria-label={`${formatMonth(d.month)}: ${d.active ? `${spend ? "spent" : d.net >= 0 ? "saved" : "overspent"} ${formatMoney(Math.abs(d.net), currency)}` : "no data"}`}
                className="relative h-full min-w-0 flex-1 px-0.5 outline-none focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
              >
                <div
                  className={cn(
                    "absolute inset-x-0.5 rounded-sm transition-colors motion-reduce:transition-none",
                    emphasized ? (!spend && !pos ? "bg-bad" : "bg-accent") : "bg-(--chart-n2)",
                  )}
                  style={{
                    height: `${len}%`,
                    minHeight: d.active ? 2 : 0,
                    ...(pos ? { bottom: `${(1 - posShare) * 100}%` } : { top: `${posShare * 100}%` }),
                  }}
                />
              </Group>
            );
          })}
        </div>
        <div className="mt-1.5 flex">
          {data.map((d, i) => (
            <span key={d.month} className={cn("font-mono flex-1 text-center text-xs", i === active ? "text-text" : "text-faint", i % 2 === 1 && "max-sm:invisible")}>
              {formatMonth(d.month, "short")}
            </span>
          ))}
        </div>
        {hover !== null && h ? (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-control border border-border bg-surface-3 px-3 py-2 text-xs shadow-pop"
            style={{ left: `${Math.min(80, Math.max(20, ((hover + 0.5) / data.length) * 100))}%`, transform: "translate(-50%, -100%)" }}
          >
            <p className="font-medium text-text">{formatMonth(h.month)}</p>
            <p className="text-muted">
              {h.active ? (
                <>
                  {spend ? "Everyday spend" : h.net >= 0 ? "Saved" : "Overspent"} <span className="money text-text">{formatMoney(Math.abs(h.net), currency, { whole: true })}</span>
                </>
              ) : (
                "No data"
              )}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
