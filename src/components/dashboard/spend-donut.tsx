"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CircleAlert } from "lucide-react";
import { formatMoney, formatPercent } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { BudgetStatus } from "@/lib/analytics/budgets";

export type AttentionItem = {
  key: string;
  label: string;
  ratio: number;
  status: BudgetStatus;
  href: string;
};

const BAR = {
  over: "bg-bad",
  near: "bg-warn",
  ok: "bg-accent",
  none: "bg-faint",
} as const;

export type SpendSlice = {
  key: string;
  label: string;
  value: number;
  color: string;
  href?: string;
  /** Monthly budget; leave undefined when none is set (shown as a dash). */
  budget?: number;
  status?: BudgetStatus;
  budgetNote?: string;
};

/**
 * Category donut with a four-column legend: Category · Share of spending · Spent · Budget.
 * Each row also carries a thin bar of how much of its budget is used. Hovering a segment or a row highlights
 * the other. Rows link to the filtered transactions page; over/near budgets outside the top rows show as chips.
 */
export function SpendDonut({
  slices,
  attention = [],
  currency,
  totalLabel = "Total spent",
}: {
  slices: SpendSlice[];
  attention?: AttentionItem[];
  currency: string;
  totalLabel?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0);
  const R = 80;
  const W = 24;
  const C = 2 * Math.PI * R;
  const gap = slices.length > 1 ? 3 : 0;
  let offset = 0;
  const focus = slices.find((s) => s.key === hover);
  const money = (n: number) => formatMoney(n, currency, { whole: true });

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      {/* the ring takes the card's width (with padding) and soaks up spare height when the card is stretched */}
      <div className="flex flex-1 items-center justify-center px-4 py-3">
        <div className="relative aspect-square w-full max-w-72">
          <svg
            viewBox="0 0 200 200"
            className="h-full w-full -rotate-90"
            role="img"
            aria-label="Spending by category"
          >
            <circle
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke="var(--surface-3)"
              strokeWidth={W}
            />
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
                    strokeWidth={hover === s.key ? W + 6 : W}
                    strokeDasharray={`${dash} ${C - dash}`}
                    strokeDashoffset={-offset}
                    opacity={hover && hover !== s.key ? 0.4 : 1}
                    onMouseEnter={() => setHover(s.key)}
                    onMouseLeave={() => setHover(null)}
                    className="cursor-pointer transition-all motion-reduce:transition-none"
                    style={{ stroke: s.color }}
                  />
                );
                offset += len;
                return el;
              })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="num text-3xl font-medium">
              {money(focus?.value ?? total)}
            </span>
            <span className="max-w-[60%] truncate text-xs text-muted">
              {focus
                ? `${focus.label} · ${formatPercent(focus.value / total)}`
                : totalLabel}
            </span>
          </div>
        </div>
      </div>

      {/* legend: a real grid so the numbers line up; Share drops out only when the card is very narrow */}
      <div
        className="mt-3 text-sm"
        role="table"
        aria-label="Spending by category"
      >
        <div
          role="row"
          className="grid grid-cols-[minmax(0,1fr)_auto_4.25rem_4.25rem] items-center gap-x-2 px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint @max-[17rem]:grid-cols-[minmax(0,1fr)_4.25rem_4.25rem]"
        >
          <span role="columnheader">Category</span>
          <span
            role="columnheader"
            className="w-9 text-right @max-[17rem]:hidden"
            title="Share of total spending"
          >
            Share
          </span>
          <span role="columnheader" className="text-right">
            Spent
          </span>
          <span role="columnheader" className="text-right">
            Budget
          </span>
        </div>
        <ul className="space-y-0.5">
          {slices.map((s) => {
            const status = s.status ?? "none";
            const row = (
              <div
                role="row"
                className="grid grid-cols-[minmax(0,1fr)_auto_4.25rem_4.25rem] items-center gap-x-2 @max-[17rem]:grid-cols-[minmax(0,1fr)_4.25rem_4.25rem]"
              >
                <span role="cell" className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                    style={{ background: s.color }}
                    aria-hidden
                  />
                  <span className="truncate" title={s.label}>
                    {s.label}
                  </span>
                  {status === "over" ? (
                    <CircleAlert
                      size={13}
                      className="shrink-0 text-bad"
                      aria-label="Over budget"
                    />
                  ) : status === "near" ? (
                    <AlertTriangle
                      size={13}
                      className="shrink-0 text-warn"
                      aria-label="Near budget limit"
                    />
                  ) : null}
                </span>
                <span
                  role="cell"
                  className="num w-9 text-right text-xs text-muted @max-[17rem]:hidden"
                  title="Share of total spending"
                >
                  {formatPercent(total ? s.value / total : 0)}
                </span>
                <span
                  role="cell"
                  className={cn(
                    "num text-right",
                    status === "over" && "text-bad",
                    status === "near" && "text-warn",
                  )}
                >
                  {money(s.value)}
                </span>
                <span
                  role="cell"
                  className="num text-right text-muted"
                  title={s.budgetNote}
                >
                  {s.budget && s.budget > 0 ? (
                    money(s.budget)
                  ) : (
                    <span aria-label="No budget set">–</span>
                  )}
                </span>
              </div>
            );
            const ratio = s.budget && s.budget > 0 ? s.value / s.budget : null;
            const bar =
              ratio !== null ? (
                <div
                  className="mt-1 pl-[18px]"
                  title={`${Math.round(ratio * 100)}% of budget used`}
                >
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none",
                        BAR[status],
                      )}
                      style={{ width: `${Math.min(100, ratio * 100)}%` }}
                    />
                  </div>
                </div>
              ) : null;
            const inner = (
              <>
                {row}
                {bar}
              </>
            );
            const cls = cn(
              "block rounded-xl px-2 py-1.5 outline-none focus-visible:outline-2 focus-visible:outline-accent",
              s.href && "hover:bg-surface-2",
              hover === s.key && "bg-surface-2",
            );
            return (
              <li
                key={s.key}
                onMouseEnter={() => setHover(s.key)}
                onMouseLeave={() => setHover(null)}
              >
                {s.href ? (
                  <Link
                    href={s.href}
                    className={cls}
                    onFocus={() => setHover(s.key)}
                    onBlur={() => setHover(null)}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className={cls}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {attention.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs">
          <span className="text-muted">Also watch</span>
          {attention.map((a) => (
            <Link
              key={a.key}
              href={a.href}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium transition hover:brightness-125",
                a.status === "over"
                  ? "bg-bad/15 text-bad"
                  : "bg-warn/15 text-warn",
              )}
            >
              {a.status === "over" ? (
                <CircleAlert size={12} />
              ) : (
                <AlertTriangle size={12} />
              )}
              {a.label} {Math.round(a.ratio * 100)}%
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
