"use client";

import { useState } from "react";
import Link from "next/link";
import { formatMoney, formatPercent } from "@/lib/money";
import { cn } from "@/lib/utils";

export type DonutSlice = { key: string; label: string; value: number; color: string; href?: string };

/** Part-to-whole donut (<= 6 segments) with 2px surface gaps, centre total and a value legend. */
export function Donut({ slices, currency, centerLabel = "Total" }: { slices: DonutSlice[]; currency: string; centerLabel?: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0);
  const R = 80;
  const W = 22;
  const C = 2 * Math.PI * R;
  const gap = slices.length > 1 ? 3 : 0;
  let offset = 0;
  const focus = slices.find((s) => s.key === hover);

  return (
    <div className="@container"><div className="flex flex-col items-center gap-5 @md:flex-row @md:items-center">
      <div className="relative h-48 w-48 shrink-0">
        <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" role="img" aria-label="Spending by category">
          <circle cx="100" cy="100" r={R} fill="none" stroke="var(--surface-3)" strokeWidth={W} />
          {total > 0 &&
            slices.map((s) => {
              const len = (s.value / total) * C;
              const dash = Math.max(0, len - gap);
              const el = (
                <circle
                  key={s.key}
                  cx="100"
                  cy="100"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={hover === s.key ? W + 6 : W}
                  strokeDasharray={`${dash} ${C - dash}`}
                  strokeDashoffset={-offset}
                  opacity={hover && hover !== s.key ? 0.4 : 1}
                  onMouseEnter={() => setHover(s.key)}
                  onMouseLeave={() => setHover(null)}
                  className="cursor-pointer transition-all"
                  style={{ stroke: s.color }}
                />
              );
              offset += len;
              return el;
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="num text-2xl font-medium">{formatMoney(focus?.value ?? total, currency, { whole: true })}</span>
          <span className="max-w-28 truncate text-xs text-muted">{focus ? `${focus.label} · ${formatPercent(focus.value / total)}` : centerLabel}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5">
        {slices.map((s) => {
          const inner = (
            <>
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              <span className="num text-muted">{formatPercent(total ? s.value / total : 0)}</span>
              <span className="num w-20 text-right">{formatMoney(s.value, currency, { whole: true })}</span>
            </>
          );
          const cls = cn("flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm", s.href && "hover:bg-surface-2", hover === s.key && "bg-surface-2");
          return (
            <li key={s.key} onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}>
              {s.href ? <Link href={s.href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>}
            </li>
          );
        })}
      </ul>
    </div></div>
  );
}
