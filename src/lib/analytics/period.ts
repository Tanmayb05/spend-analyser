import { monthStart, monthsOfYear } from "@/lib/dates";
import { metric, type TxnFilters } from "@/lib/analytics/filters";
import type { LedgerRow } from "@/lib/data/types";
import { round2 } from "@/lib/utils";

export type YearPoint = { month: string; a: number; future: boolean };

/** Jan..Dec of `year`. `a` follows the page metric (income when filtering income, else spend). Months after today's month are `future`. */
export function yearSeries(rows: LedgerRow[], year: number | string, filters: TxnFilters, today: string): YearPoint[] {
  const byMonth = new Map<string, LedgerRow[]>();
  for (const r of rows) {
    const list = byMonth.get(r.month);
    if (list) list.push(r);
    else byMonth.set(r.month, [r]);
  }
  const current = monthStart(today);
  return monthsOfYear(year).map((month) => ({
    month,
    a: metric(byMonth.get(month) ?? [], filters),
    future: month > current,
  }));
}

/** Rows that count "to date": scheduled rows are left out, except in months that haven't started (where they're all there is). */
export function postedRows(rows: LedgerRow[], today: string): LedgerRow[] {
  const current = monthStart(today);
  return rows.filter((r) => !r.is_scheduled || r.month > current);
}

export type PeriodKpis = { spend: number; income: number; saved: number; savingsRate: number | null };

/** Totals for a set of rows. saved = income - spend (negative = loss). */
export function periodKpis(rows: LedgerRow[]): PeriodKpis {
  const spend = round2(rows.reduce((a, r) => a + Number(r.spend), 0));
  const income = round2(rows.reduce((a, r) => a + Number(r.income), 0));
  const saved = round2(income - spend);
  return { spend, income, saved, savingsRate: income > 0 ? saved / income : null };
}

/** Rows whose month falls in [from, to] (month starts, inclusive). */
export function rowsInMonths(rows: LedgerRow[], from: string, to: string): LedgerRow[] {
  return rows.filter((r) => r.month >= from && r.month <= to);
}

/** Keep the top `n` items and fold the rest into one "other" entry (so a donut still sums to the whole). */
export function foldOther<T extends { key: string; value: number }>(items: T[], n = 6): (T | { key: "other"; value: number })[] {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  if (sorted.length <= n + 1) return sorted;
  const rest = sorted.slice(n).reduce((a, x) => a + x.value, 0);
  return [...sorted.slice(0, n), { key: "other" as const, value: round2(rest) }];
}
