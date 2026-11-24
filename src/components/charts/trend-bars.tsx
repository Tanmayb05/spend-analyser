"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { thinnedOnPhone } from "@/lib/chart-labels";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { formatMonth } from "@/lib/dates";
import { compactNumber, niceTicks } from "./scale";

export type TrendPoint = { month: string; a: number; b?: number; href?: string; /** planned/committed amount for a month that has not started: drawn lighter */ future?: boolean };

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
  barMaxWidth = 16,
  confirmSelect = false,
}: {
  data: TrendPoint[];
  selected: string;
  currency: string;
  aLabel: string;
  bLabel?: string;
  aColor: string;
  bColor?: string;
  height?: number;
  /** Widest a single bar may grow, in px (bars still shrink to fit narrow slots). */
  barMaxWidth?: number;
  /** Bars pin a preview on click; only the "View <month>" button (using the point's href) navigates. */
  confirmSelect?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const max = Math.max(0, ...data.flatMap((d) => [d.a, d.b ?? 0]));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const selectedIdx = data.findIndex((d) => d.month === selected);
  const active = hover ?? pinned ?? selectedIdx;
  const pair = bLabel !== undefined;
  const pinnedPoint = confirmSelect && pinned !== null ? data[pinned] : undefined;

  // a pinned preview is dropped on Escape or a tap outside the chart
  useEffect(() => {
    if (pinned === null) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setPinned(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPinned(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  return (
    // `height` is the minimum plot height; inside a taller flex parent the plot grows to fill it
    <div ref={root} className="flex h-full flex-col">
      <div className="mb-6 flex flex-wrap items-center gap-4 text-xs text-muted">
        <LegendDot color={aColor} label={aLabel} />
        {pair ? <LegendDot color={bColor!} label={bLabel!} /> : null}
      </div>
      <div className="flex min-h-0 flex-1 gap-2">
        {/* y axis: a plot-height column plus an invisible twin of the x-label row so ticks line up with the bars */}
        <div className="flex w-10 shrink-0 flex-col text-right text-xs text-faint">
          <div className="relative flex-1" style={{ minHeight: height }}>
            {ticks.map((t) => (
              <span key={t} className="absolute right-0 -translate-y-1/2 font-mono" style={{ bottom: `${(t / top) * 100}%` }}>
                {compactNumber(t)}
              </span>
            ))}
          </div>
          <div className="mt-2 text-xs" aria-hidden>&nbsp;</div>
        </div>
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative flex-1" style={{ minHeight: height }}>
          {/* grid */}
          <div className="pointer-events-none absolute inset-0">
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 h-px bg-[var(--grid)]" style={{ bottom: `${(t / top) * 100}%` }} />
            ))}
          </div>
          <div className="absolute inset-0 flex items-end" onMouseLeave={() => setHover(null)}>
            {data.map((d, i) => {
              const emphasized = i === active;
              const label = `${formatMonth(d.month)}${d.future ? " (planned)" : ""}: ${aLabel} ${formatMoney(d.a, currency)}${pair ? `, ${bLabel} ${formatMoney(d.b ?? 0, currency)}` : ""}`;
              const groupClass = "flex h-full min-w-0 flex-1 items-end justify-center gap-0.5 px-[3px] outline-none";
              const bars = (
                <>
                  <Bar value={d.a} top={top} maxWidth={barMaxWidth} color={aColor} dim={active !== -1 && !emphasized} future={d.future} />
                  {pair ? <Bar value={d.b ?? 0} top={top} maxWidth={barMaxWidth} color={bColor!} dim={active !== -1 && !emphasized} future={d.future} /> : null}
                </>
              );
              const hoverProps = { onMouseEnter: () => setHover(i), onFocus: () => setHover(i) };
              if (confirmSelect) {
                return (
                  <button
                    key={d.month}
                    type="button"
                    aria-pressed={pinned === i}
                    aria-label={label}
                    onClick={() => setPinned((p) => (p === i ? null : i))}
                    {...hoverProps}
                    className={groupClass}
                  >
                    {bars}
                  </button>
                );
              }
              if (d.href) {
                return (
                  <Link key={d.month} href={d.href} scroll={false} aria-label={label} {...hoverProps} className={groupClass}>
                    {bars}
                  </Link>
                );
              }
              return (
                <div key={d.month} aria-label={label} {...hoverProps} className={groupClass}>
                  {bars}
                </div>
              );
            })}
          </div>
          </div>
          {/* x labels */}
          <div className="mt-2 flex">
            {data.map((d, i) => (
              <span key={d.month} className={cn("flex-1 text-center font-mono text-xs", active === -1 || i === active ? "text-text" : "text-faint", thinnedOnPhone(i, data.length) && "max-sm:invisible")}>
                {formatMonth(d.month, "short")}
              </span>
            ))}
          </div>
          {/* tooltip */}
          {hover !== null && data[hover] ? (
            <div
              className="pointer-events-none absolute top-2 z-10 rounded-control border border-border bg-surface-3 px-3 py-2 text-xs shadow-pop"
              style={{ left: `${Math.min(85, Math.max(15, ((hover + 0.5) / data.length) * 100))}%`, transform: "translate(-50%, -100%)" }}
            >
              <p className="mb-1 font-medium text-text">{formatMonth(data[hover].month)}{data[hover].future ? " · planned" : ""}</p>
              <p className="text-muted">
                {aLabel}: <span className="money text-text">{formatMoney(data[hover].a, currency, { whole: true })}</span>
              </p>
              {pair ? (
                <p className="text-muted">
                  {bLabel}: <span className="money text-text">{formatMoney(data[hover].b ?? 0, currency, { whole: true })}</span>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {pinnedPoint && pinnedPoint.href && pinnedPoint.month !== selected ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-inset border border-border bg-surface-2 px-4 py-3">
          <div className="min-w-0 text-sm">
            <p className="font-medium text-text">{formatMonth(pinnedPoint.month)}{pinnedPoint.future ? " · planned" : ""}</p>
            <p className="text-xs text-muted">
              {aLabel}: <span className="money text-text">{formatMoney(pinnedPoint.a, currency, { whole: true })}</span>
              {pair ? (
                <>
                  {" · "}
                  {bLabel}: <span className="money text-text">{formatMoney(pinnedPoint.b ?? 0, currency, { whole: true })}</span>
                </>
              ) : null}
            </p>
          </div>
          <Link
            href={pinnedPoint.href}
            scroll={false}
            onClick={() => setPinned(null)}
            className="inline-flex h-9 items-center rounded-control bg-text px-4 text-sm font-medium text-bg transition-opacity hover:opacity-90"
          >
            View {formatMonth(pinnedPoint.month, "short")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function Bar({ value, top, maxWidth, color, dim, future }: { value: number; top: number; maxWidth: number; color: string; dim: boolean; future?: boolean }) {
  const h = Math.max(0, (value / top) * 100);
  return (
    <div
      className="w-full rounded-t-sm transition-opacity duration-(--dur-base) motion-reduce:transition-none"
      style={{ height: `${h}%`, maxWidth, minHeight: value > 0 ? 2 : 0, background: color, opacity: (dim ? 0.35 : 1) * (future ? 0.55 : 1) }}
    />
  );
}

export function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}
