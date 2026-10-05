import type { LedgerRow } from "@/lib/data/types";
import { addMonths, daysInMonth, monthEnd, monthStart, parseISO, toISO, type ISODate } from "@/lib/dates";
import { round2 } from "@/lib/utils";

export type Scope = "all" | "core";

/**
 * Rows that count "to date": scheduled (future) rows are excluded, except when the whole month is
 * in the future, where scheduled rows are all there is (committed spend).
 */
export function countable(rows: LedgerRow[], month: ISODate, today: ISODate): LedgerRow[] {
  const futureMonth = monthStart(month) > monthStart(today);
  return futureMonth ? rows : rows.filter((r) => !r.is_scheduled);
}

export type MonthTotals = { month: ISODate; spent: number; income: number; net: number; savingsRate: number | null; core: number; count: number };

export function totalsFor(rows: LedgerRow[], month: ISODate, today: ISODate): MonthTotals {
  const m = monthStart(month);
  const inMonth = countable(rows.filter((r) => r.month === m), m, today);
  let spent = 0;
  let income = 0;
  let core = 0;
  for (const r of inMonth) {
    spent += Number(r.spend);
    income += Number(r.income);
    if (r.is_core) core += Number(r.spend);
  }
  spent = round2(spent);
  income = round2(income);
  const net = round2(income - spent);
  return { month: m, spent, income, net, savingsRate: income > 0 ? net / income : null, core: round2(core), count: inMonth.length };
}

export function monthlySeries(rows: LedgerRow[], months: ISODate[], today: ISODate): MonthTotals[] {
  return months.map((m) => totalsFor(rows, m, today));
}

export type CategoryTotal = { categoryId: string; spent: number; count: number };

export function byCategory(rows: LedgerRow[], month: ISODate, today: ISODate, scope: Scope = "all"): CategoryTotal[] {
  const m = monthStart(month);
  const acc = new Map<string, CategoryTotal>();
  for (const r of countable(rows.filter((x) => x.month === m && x.type !== "income"), m, today)) {
    if (scope === "core" && !r.is_core) continue;
    const t = acc.get(r.category_id) ?? { categoryId: r.category_id, spent: 0, count: 0 };
    t.spent += Number(r.spend);
    t.count += 1;
    acc.set(r.category_id, t);
  }
  return [...acc.values()].map((t) => ({ ...t, spent: round2(t.spent) })).filter((t) => t.spent !== 0).sort((a, b) => b.spent - a.spent);
}

/** Top N categories + an "Other" bucket (for a donut with <= 6 segments). */
export function topWithOther(items: CategoryTotal[], n = 5): (CategoryTotal | { categoryId: "other"; spent: number; count: number })[] {
  const positive = items.filter((i) => i.spent > 0);
  if (positive.length <= n + 1) return positive;
  const head = positive.slice(0, n);
  const tail = positive.slice(n);
  return [...head, { categoryId: "other", spent: round2(tail.reduce((a, b) => a + b.spent, 0)), count: tail.reduce((a, b) => a + b.count, 0) }];
}

export function dailySpend(rows: LedgerRow[], month: ISODate): Map<string, { spent: number; count: number }> {
  const m = monthStart(month);
  const out = new Map<string, { spent: number; count: number }>();
  for (const r of rows) {
    if (r.month !== m || r.type === "income") continue;
    const d = out.get(r.entry_date) ?? { spent: 0, count: 0 };
    d.spent = round2(d.spent + Number(r.spend));
    d.count += 1;
    out.set(r.entry_date, d);
  }
  return out;
}

/** Average of the `n` months before `month` (months with no data count as 0). */
export function trailingAverage(series: MonthTotals[], month: ISODate, n: number, pick: (t: MonthTotals) => number): number | null {
  const idx = series.findIndex((s) => s.month === monthStart(month));
  if (idx < n) return null;
  const window = series.slice(idx - n, idx);
  return round2(window.reduce((a, s) => a + pick(s), 0) / n);
}

export function daysLeft(month: ISODate, today: ISODate): number {
  const m = monthStart(month);
  if (m !== monthStart(today)) return 0;
  return daysInMonth(m) - Number(today.slice(8, 10)) + 1;
}

/** Months window ending at `month`. */
export function lastMonths(month: ISODate, n: number): ISODate[] {
  return Array.from({ length: n }, (_, i) => addMonths(monthStart(month), i - n + 1));
}

export function upcoming(rows: LedgerRow[], today: ISODate, days = 30): LedgerRow[] {
  const end = parseISO(today);
  end.setDate(end.getDate() + days);
  const endIso = toISO(end);
  return rows.filter((r) => r.entry_date > today && r.entry_date <= endIso && r.type !== "income").sort((a, b) => a.entry_date.localeCompare(b.entry_date));
}

export { monthEnd };
