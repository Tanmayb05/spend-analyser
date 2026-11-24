import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { formatMoney, formatPercent } from "@/lib/money";
import { cn } from "@/lib/utils";
import { barMax, deltaOf, showsPercent, splitMovers, STEADY_BELOW, STEADY_PCT, thanPhrase } from "@/lib/analytics/movers";
import type { CategoryMover } from "@/lib/analytics/insight-views";
import type { ReactNode } from "react";

export type MoverView = CategoryMover & { name: string; color: string; href: string };

/** Rows shown in each list before the rest fold away. */
const SHOWN = 5;

/** Two short bars on one scale: this month on top, the comparison (usual, last month...) in grey underneath. */
function PairBars({ now, base, max, tone }: { now: number; base: number; max: number; tone: "more" | "less" }) {
  return (
    <span className="flex flex-col gap-1" aria-hidden>
      <span className="block h-2 overflow-hidden rounded-sm bg-transparent">
        <span className={cn("block h-full rounded-sm", tone === "more" ? "bg-warn" : "bg-good")} style={{ width: `${Math.max(1, (now / max) * 100)}%` }} />
      </span>
      <span className="block h-2 overflow-hidden rounded-sm">
        <span className="block h-full rounded-sm bg-surface-3" style={{ width: `${Math.max(1, (base / max) * 100)}%` }} />
      </span>
    </span>
  );
}

/**
 * Plain-language view of what changed against a baseline: one sentence and two bars for the total, then
 * "Spending more on" and "Spending less on", each category as this month's bar over the comparison bar.
 * Categories that barely changed get their own card.
 */
export function CategoryMovers({ items, currency, info, baseLabel }: { items: MoverView[]; currency: string; info?: ReactNode; baseLabel: string }) {
  const money = (n: number) => formatMoney(n, currency, { whole: true });
  const { moved, steady } = splitMovers(items);
  const baseName = baseLabel.charAt(0).toUpperCase() + baseLabel.slice(1);

  if (!items.length)
    return (
      <Card>
        <CardHeader title="What moved" info={info} />
        <p className="text-sm text-muted">No spending to compare for this month</p>
      </Card>
    );

  const now = items.reduce((a, c) => a + c.spent, 0);
  const base = items.reduce((a, c) => a + c.base, 0);
  const total = now - base;
  const level = Math.abs(total) < STEADY_BELOW;
  const leaders = moved.filter((c) => (total > 0 ? deltaOf(c) > 0 : deltaOf(c) < 0)).slice(0, 2).map((c) => c.name);
  const sentence = level
    ? `You're spending about the same as ${baseLabel === "usual" ? "usual" : baseLabel}.`
    : `You're spending ${money(Math.abs(total))} ${total > 0 ? "more" : "less"} ${thanPhrase(baseLabel)}${leaders.length ? `, mostly ${total > 0 ? "on" : "because of less on"} ${leaders.join(" and ")}` : ""}.`;
  const totalMax = barMax([now, base]);

  const more = moved.filter((c) => deltaOf(c) > 0);
  const less = moved.filter((c) => deltaOf(c) < 0);

  const list = (rows: MoverView[], tone: "more" | "less") => {
    const max = barMax(rows.flatMap((c) => [c.spent, c.base]));
    const row = (c: MoverView) => {
      const d = deltaOf(c);
      return (
        <li key={c.categoryId}>
          <Link href={c.href} className="grid grid-cols-[5.5rem_minmax(0,1fr)_7rem] items-center gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[9rem_minmax(0,1fr)_8rem]">
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
              <span className="truncate">{c.name}</span>
            </span>
            <PairBars now={c.spent} base={c.base} max={max} tone={tone} />
            <span className="whitespace-nowrap text-right">
              <span className={cn("money text-sm", tone === "more" ? "text-warn" : "text-good")}>{d > 0 ? "+" : "−"}{money(Math.abs(d))}</span>
              <span className="ml-2 text-xs text-muted">{c.base <= 0 ? "new" : showsPercent(c) ? formatPercent(Math.abs(c.change!)) : ""}</span>
            </span>
          </Link>
        </li>
      );
    };
    return (
      <>
        <ul className="divide-y divide-border">{rows.slice(0, SHOWN).map(row)}</ul>
        {rows.length > SHOWN ? (
          <details className="mt-4 border-t border-border pt-3">
            <summary className="cursor-pointer text-sm text-muted transition-colors duration-(--dur-fast) hover:text-text">{rows.length - SHOWN} more</summary>
            <ul className="mt-3 divide-y divide-border">{rows.slice(SHOWN).map(row)}</ul>
          </details>
        ) : null}
      </>
    );
  };

  const key = (tone: "more" | "less") => (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      <span className="flex items-center gap-1.5"><span className={cn("h-2 w-4 rounded-sm", tone === "more" ? "bg-warn" : "bg-good")} aria-hidden />This month</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-surface-3 ring-1 ring-inset ring-border" aria-hidden />{baseName}</span>
    </span>
  );

  return (
    <>
      <Card>
        <CardHeader title={`This month vs ${baseLabel}`} info={info} />
        <p className="text-base">{sentence}</p>
        <div className="mt-5 space-y-2">
          {[
            { label: "This month", value: now, bar: "bg-text" },
            { label: baseName, value: base, bar: "bg-surface-3 ring-1 ring-inset ring-border" },
          ].map((r) => (
            <div key={r.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)_5.5rem] items-center gap-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)_6rem]">
              <span className="truncate text-muted">{r.label}</span>
              <span className="block h-4 overflow-hidden rounded-sm" aria-hidden>
                <span className={cn("block h-full rounded-sm", r.bar)} style={{ width: `${Math.max(1, (r.value / totalMax) * 100)}%` }} />
              </span>
              <span className="money text-right">{money(r.value)}</span>
            </div>
          ))}
        </div>
      </Card>

      {more.length ? (
        <Card>
          <CardHeader title="Spending more on" subtitle={`Categories that are higher ${thanPhrase(baseLabel)}`} />
          <div className="mb-4">{key("more")}</div>
          {list(more, "more")}
        </Card>
      ) : null}

      {less.length ? (
        <Card>
          <CardHeader title="Spending less on" subtitle={`Categories that are lower ${thanPhrase(baseLabel)}`} />
          <div className="mb-4">{key("less")}</div>
          {list(less, "less")}
        </Card>
      ) : null}

      {steady.length ? (
        <Card>
          <CardHeader title="About the same" subtitle={`Within ${money(STEADY_BELOW)} or ${formatPercent(STEADY_PCT)} of ${baseLabel}`} />
          <ul className="divide-y divide-border">
            {steady.map((c) => (
              <li key={c.categoryId}>
                <Link href={c.href} className="flex items-baseline justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
                    <span className="truncate">{c.name}</span>
                  </span>
                  <span className="money shrink-0">{money(c.spent)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
