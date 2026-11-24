"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type BreakdownPart = { label: string; color: string; share: number; percent: string; amount: string };

/**
 * Trip spending split as one bar over a legend. The two are linked: hover or focus a segment and it grows while its legend row
 * is highlighted; hover or focus a row and its segment grows. Everything else dims a little.
 */
export function TripBreakdown({ parts }: { parts: BreakdownPart[] }) {
  const [active, setActive] = useState<string | null>(null);
  const on = (label: string) => ({
    onPointerEnter: () => setActive(label),
    onPointerLeave: () => setActive(null),
    onFocus: () => setActive(label),
    onBlur: () => setActive(null),
  });
  return (
    <>
      <div className="flex h-4 items-center gap-px overflow-hidden rounded-inset" role="list" aria-label="Spending by category">
        {parts.map((p) => (
          <div
            key={p.label}
            role="listitem"
            aria-label={`${p.label}, ${p.percent}, ${p.amount}`}
            title={p.label}
            {...on(p.label)}
            className={cn("rounded-sm transition-[height,opacity] duration-(--dur-fast) ease-ui", active === p.label ? "h-4" : "h-2", active && active !== p.label ? "opacity-40" : "opacity-100")}
            style={{ width: `${p.share * 100}%`, background: p.color }}
          />
        ))}
      </div>
      <ul className="mt-4 space-y-1 text-sm">
        {parts.map((p) => (
          <li
            key={p.label}
            tabIndex={0}
            {...on(p.label)}
            className={cn(
              "-mx-2 flex items-center gap-2 rounded-control px-2 py-1 outline-offset-2 transition-[background-color,box-shadow,opacity] duration-(--dur-fast) ease-ui",
              active === p.label ? "bg-surface-3 ring-1 ring-inset ring-text/10" : active ? "opacity-60" : "",
            )}
          >
            <span className={cn("rounded-sm", active === p.label ? "size-3" : "size-2.5")} style={{ background: p.color }} aria-hidden />
            <span className="flex-1">{p.label}</span>
            <span className="num text-muted">{p.percent}</span>
            <span className="money w-20 text-right">{p.amount}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
