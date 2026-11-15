import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { InfoTitle } from "@/components/ui/info-title";
import { HELP } from "@/lib/help";
import { formatMoney, formatPercent } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PeriodKpis } from "@/lib/analytics/period";

type Delta = { value: number | null; label: string };

function DeltaPill({ delta, goodWhenUp }: { delta: Delta; goodWhenUp: boolean }) {
  const v = delta.value;
  if (v == null || !Number.isFinite(v)) return null;
  const up = v > 0;
  const good = v === 0 ? null : up === goodWhenUp;
  return (
    <span className={cn("rounded-full px-2 py-0.5 font-medium", good === null ? "bg-surface-3 text-muted" : good ? "bg-good/15 text-good" : "bg-bad/15 text-bad")}>
      {up ? "▲" : "▼"} {formatPercent(Math.abs(v))} {delta.label}
    </span>
  );
}

/** Total spend · Total income · Saved / Loss for the visible period, each with a delta against the previous period. */
export function PeriodKpiStrip({
  kpis,
  currency,
  period,
  deltas,
  children,
}: {
  kpis: PeriodKpis;
  currency: string;
  /** e.g. "November 2026" or "2026" */
  period: string;
  deltas: { spend: Delta; income: Delta; saved: Delta };
  /** Chart / insight shown under the totals, inside the same card */
  children?: ReactNode;
}) {
  const money = (n: number) => formatMoney(n, currency, { whole: true });
  const noIncome = kpis.income <= 0; // "saved" is meaningless without income (e.g. a month of only planned spend)
  const loss = !noIncome && kpis.saved < 0;
  const items = [
    { key: "spend", label: "Total spend", value: money(kpis.spend), tone: "", sub: null as string | null, delta: deltas.spend, goodWhenUp: false },
    { key: "income", label: "Total income", value: money(kpis.income), tone: "", sub: null, delta: deltas.income, goodWhenUp: true },
    noIncome
      ? { key: "saved", label: "Saved / loss", value: "–", tone: "", sub: "No income in this period", delta: { value: null, label: "" }, goodWhenUp: true }
      : {
          key: "saved",
          label: loss ? "Loss" : "Saved",
          value: `${loss ? "−" : ""}${money(Math.abs(kpis.saved))}`,
          tone: loss ? "text-bad" : kpis.saved > 0 ? "text-good" : "",
          sub: kpis.savingsRate == null ? null : loss ? `${formatPercent(Math.abs(kpis.savingsRate))} over income` : `${formatPercent(kpis.savingsRate)} of income saved`,
          delta: deltas.saved,
          goodWhenUp: true,
        },
  ];
  return (
    <Card aria-label={`Totals for ${period}`}>
      <InfoTitle as="p" info={HELP.filteredTotal} className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
        Totals · {period}
      </InfoTitle>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {items.map((i) => (
          <div key={i.key} className="min-w-0">
            <dt className="text-sm text-muted">{i.label}</dt>
            <dd className={cn("num mt-1 truncate text-3xl font-medium", i.tone)}>{i.value}</dd>
            {i.sub ? <p className="mt-0.5 text-xs text-muted">{i.sub}</p> : null}
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <DeltaPill delta={i.delta} goodWhenUp={i.goodWhenUp} />
            </div>
          </div>
        ))}
      </dl>
      {children ? <div className="mt-6">{children}</div> : null}
    </Card>
  );
}
