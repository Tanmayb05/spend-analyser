import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
    <Badge tone={good === null ? "neutral" : good ? "good" : "bad"}>
      {up ? "▲" : "▼"} {formatPercent(Math.abs(v))} {delta.label}
    </Badge>
  );
}

/** Total spend · Total income · Saved / Loss for the visible period, each with a delta against the previous period. */
export function PeriodKpiStrip({
  kpis,
  currency,
  period,
  deltas,
  everyday = false,
  basis,
  children,
}: {
  kpis: PeriodKpis;
  currency: string;
  /** e.g. "November 2026" or "2026" */
  period: string;
  deltas: { spend: Delta; income: Delta; saved: Delta };
  /** Everyday view: income isn't part of it, so income and saved read "—" rather than a misleading $0. */
  everyday?: boolean;
  /** "Actual" (posted only) or "Projected" (incl. scheduled), shown when scheduled rows exist in the period. */
  basis?: "Actual" | "Projected";
  /** Chart / insight shown under the totals, inside the same card */
  children?: ReactNode;
}) {
  const money = (n: number) => formatMoney(n, currency, { whole: true });
  const noIncome = kpis.income <= 0; // "saved" is meaningless without income (e.g. a month of only planned spend)
  const loss = !noIncome && kpis.saved < 0;
  const noDelta = { value: null, label: "" };
  const items = [
    { key: "spend", label: "Total spend", value: money(kpis.spend), tone: "", sub: null as string | null, delta: deltas.spend, goodWhenUp: false, hint: undefined as string | undefined },
    everyday
      ? { key: "income", label: "Total income", value: "—", tone: "text-muted", sub: "Not part of Everyday", delta: noDelta, goodWhenUp: true, hint: "Income is excluded from Everyday view." }
      : { key: "income", label: "Total income", value: money(kpis.income), tone: "", sub: null, delta: deltas.income, goodWhenUp: true, hint: undefined },
    everyday
      ? { key: "saved", label: "Saved / loss", value: "—", tone: "text-muted", sub: "Needs income", delta: noDelta, goodWhenUp: true, hint: "Saved needs income, which Everyday view leaves out." }
      : noIncome
      ? { key: "saved", label: "Saved / loss", value: "–", tone: "", sub: "No income in this period", delta: noDelta, goodWhenUp: true, hint: undefined }
      : {
          key: "saved",
          label: loss ? "Loss" : "Saved",
          value: `${loss ? "−" : ""}${money(Math.abs(kpis.saved))}`,
          tone: loss ? "text-bad" : kpis.saved > 0 ? "text-good" : "",
          sub: kpis.savingsRate == null ? null : loss ? `${formatPercent(Math.abs(kpis.savingsRate))} over income` : `${formatPercent(kpis.savingsRate)} of income saved`,
          delta: deltas.saved,
          goodWhenUp: true,
          hint: undefined,
        },
  ];
  return (
    <Card aria-label={`Totals for ${period}`}>
      <InfoTitle as="p" info={HELP.filteredTotal} className="mb-4 text-label text-muted">
        Totals · {period}
        {basis ? <Badge className="ml-2">{basis}</Badge> : null}
      </InfoTitle>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border">
        {items.map((i) => (
          <div key={i.key} className="min-w-0 sm:px-card sm:first:pl-0 sm:last:pr-0">
            <dt className="text-sm text-muted">{i.label}</dt>
            <dd className={cn("num-lg mt-1 truncate text-3xl font-medium", i.tone)} title={i.hint}>{i.value}</dd>
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

/**
 * Totals for the Income filter: what came in, the monthly average and the best month. Replaces the spend / income / saved
 * strip only while the Type filter is Income, so every other view keeps its usual totals.
 */
export function IncomeKpiStrip({
  income,
  delta,
  currency,
  period,
  avgMonth,
  monthsCounted,
  peak,
  basis,
  children,
}: {
  income: number;
  delta: Delta;
  currency: string;
  /** e.g. "November 2026" or "2026" */
  period: string;
  /** Average income per month so far this year (from the first month with income) */
  avgMonth: number;
  monthsCounted: number;
  peak: { label: string; value: number } | null;
  basis?: "Actual" | "Projected";
  children?: ReactNode;
}) {
  const money = (n: number) => formatMoney(n, currency, { whole: true });
  const items = [
    { key: "income", label: "Total income", value: money(income), sub: null as string | null, delta },
    { key: "avg", label: "Average per month", value: money(avgMonth), sub: monthsCounted ? `over ${monthsCounted === 1 ? "1 month" : `${monthsCounted} months`} this year` : "No income yet this year", delta: { value: null, label: "" } },
    { key: "peak", label: "Highest month", value: peak ? money(peak.value) : "–", sub: peak?.label ?? null, delta: { value: null, label: "" } },
  ];
  return (
    <Card aria-label={`Income totals for ${period}`}>
      <InfoTitle as="p" info={HELP.filteredTotal} className="mb-4 text-label text-muted">
        Income · {period}
        {basis ? <Badge className="ml-2">{basis}</Badge> : null}
      </InfoTitle>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border">
        {items.map((i) => (
          <div key={i.key} className="min-w-0 sm:px-card sm:first:pl-0 sm:last:pr-0">
            <dt className="text-sm text-muted">{i.label}</dt>
            <dd className="num-lg mt-1 truncate text-3xl font-medium text-good">{i.value}</dd>
            {i.sub ? <p className="mt-0.5 text-xs text-muted">{i.sub}</p> : null}
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <DeltaPill delta={i.delta} goodWhenUp />
            </div>
          </div>
        ))}
      </dl>
      {children ? <div className="mt-6">{children}</div> : null}
    </Card>
  );
}
