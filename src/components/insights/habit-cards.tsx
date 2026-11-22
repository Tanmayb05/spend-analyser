import Link from "next/link";
import { Card, CardHeader, Insight } from "@/components/ui/card";
import { StatStrip } from "@/components/cards/stat-strip";
import { formatMoney } from "@/lib/money";
import { formatDay } from "@/lib/dates";
import { ACCENT, NEUTRAL } from "@/components/charts/colors";
import type { MerchantRow, RecurringCharge, Rhythm } from "@/lib/analytics/insight-views";
import type { ReactNode } from "react";

export type MerchantView = MerchantRow & { href: string };
export type RecurringView = RecurringCharge & { href: string };

export function MerchantsCard({ items, currency, info }: { items: MerchantView[]; currency: string; info?: ReactNode }) {
  const money = (n: number) => formatMoney(n, currency, { whole: true });
  return (
    <Card>
      <CardHeader title="Where it went" subtitle="Top merchants this month against their usual month" info={info} />
      {items.length ? (
        <ul className="divide-y divide-border">
          {items.map((m) => (
            <li key={m.merchantId}>
              <Link href={m.href} className="flex items-baseline justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0">
                <span className="min-w-0">
                  <span className="block truncate">{m.name || "—"}</span>
                  <span className="block text-xs text-muted">
                    {m.isNew ? "New this month" : `Usually ${money(m.avg)}`} · {m.count === 1 ? "1 purchase" : `${m.count} purchases`}
                  </span>
                </span>
                <span className="money shrink-0">{money(m.spent)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No merchant spending this month</p>
      )}
    </Card>
  );
}

export function RecurringCard({ items, currency, info }: { items: RecurringView[]; currency: string; info?: ReactNode }) {
  const money = (n: number) => formatMoney(n, currency, { whole: true });
  const total = items.reduce((a, r) => a + r.typical, 0);
  return (
    <Card>
      <CardHeader title="Repeats every month" subtitle="Charges that landed in at least 3 of the last 4 months at a steady amount" info={info} />
      {items.length ? (
        <>
          <ul className="divide-y divide-border">
            {items.map((r) => (
              <li key={r.merchantId}>
                <Link href={r.href} className="flex items-baseline justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0">
                  <span className="min-w-0">
                    <span className="block truncate">{r.name || "—"}</span>
                    <span className="block text-xs text-muted">Last charged {formatDay(r.lastDate)}</span>
                  </span>
                  <span className="money shrink-0">{money(r.typical)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Insight>
            {items.length === 1 ? "One charge repeats" : `${items.length} charges repeat`}, about {money(total)} a month or {money(total * 12)} a year. Cancel one you no longer use and it comes straight off.
          </Insight>
        </>
      ) : (
        <p className="text-sm text-muted">Nothing repeats at a steady amount yet</p>
      )}
    </Card>
  );
}

export function RhythmCard({ rhythm, currency, info }: { rhythm: Rhythm; currency: string; info?: ReactNode }) {
  const money = (n: number) => formatMoney(n, currency, { whole: true });
  const max = Math.max(...rhythm.weekdays.map((w) => w.avg), 1);
  return (
    <Card>
      <CardHeader title="Your spending days" subtitle="Average spent on each day of the week, last 3 months" info={info} />
      <ul className="grid grid-cols-7 items-end gap-2" aria-label="Average spend by weekday">
        {rhythm.weekdays.map((w) => (
          <li key={w.label} className="flex flex-col items-center gap-1.5">
            <span className="money text-xs text-muted">{money(w.avg)}</span>
            <span className="flex h-24 w-full items-end">
              <span
                className="w-full rounded-sm"
                style={{ height: `${Math.max((w.avg / max) * 100, w.avg > 0 ? 3 : 0)}%`, background: w.label === rhythm.busiest ? ACCENT : NEUTRAL.mid }}
              />
            </span>
            <span className="text-xs text-muted">{w.label}</span>
          </li>
        ))}
      </ul>
      {rhythm.busiest ? <Insight>{rhythm.busiest} is your most expensive day on average.</Insight> : null}
    </Card>
  );
}

export function HabitStats({ rhythm, currency }: { rhythm: Rhythm; currency: string }) {
  const money = (n: number) => formatMoney(n, currency, { whole: true });
  return (
    <StatStrip
      stats={[
        { label: "Per day this month", value: money(rhythm.perDay) },
        { label: "Days with no spending", value: rhythm.daysElapsed ? `${rhythm.noSpendDays} of ${rhythm.daysElapsed}` : "–" },
        { label: "Typical purchase", value: rhythm.count ? money(rhythm.avgTxn) : "–" },
        { label: "Biggest purchase", value: rhythm.biggest ? money(rhythm.biggest.amount) : "–" },
      ]}
    />
  );
}
