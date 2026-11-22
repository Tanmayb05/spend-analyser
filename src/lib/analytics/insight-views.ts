import type { LedgerRow } from "@/lib/data/types";
import { addMonths, daysInMonth, formatMonth, monthStart, parseISO, type ISODate } from "@/lib/dates";
import { round2 } from "@/lib/utils";
import { budgetStatus, type BudgetStatus, type ResolvedBudget } from "./budgets";
import { byCategory, countable, totalsFor } from "./summary";

/** Pure data shaping for the Insights tabs (Categories, Merchants & habits). No AI, no I/O. */

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// ---- Period compare -------------------------------------------------------------------------

/** What a month is compared with: the 3 months before it (averaged), the month before, or the same month a year earlier. */
export type CompareBase = "avg" | "prev" | "year";

export function parseCompareBase(v: unknown): CompareBase {
  return v === "prev" || v === "year" ? v : "avg";
}

/** Months averaged to form the baseline. */
function baseMonths(month: ISODate, vs: CompareBase): ISODate[] {
  const m = monthStart(month);
  return vs === "prev" ? [addMonths(m, -1)] : vs === "year" ? [addMonths(m, -12)] : [1, 2, 3].map((i) => addMonths(m, -i));
}

/** Short wording for the baseline: "vs usual", "vs last month", "vs Oct 2025". */
export function compareLabel(month: ISODate, vs: CompareBase): string {
  return vs === "avg" ? "usual" : vs === "prev" ? "last month" : formatMonth(addMonths(monthStart(month), -12));
}

export type CompareTotals = {
  spent: { now: number; base: number; change: number | null };
  income: { now: number; base: number; change: number | null };
  saved: { now: number; base: number; change: number | null };
};

const rel = (now: number, base: number) => (base ? (now - base) / Math.abs(base) : null);

/** Spent, income and saved for a month against its baseline (an average when the baseline spans several months). */
export function compareTotals(rows: LedgerRow[], month: ISODate, today: ISODate, vs: CompareBase): CompareTotals {
  const cur = totalsFor(rows, month, today);
  const months = baseMonths(month, vs).map((m) => totalsFor(rows, m, today));
  const avg = (pick: (t: (typeof months)[number]) => number) => round2(months.reduce((a, t) => a + pick(t), 0) / months.length);
  const base = { spent: avg((t) => t.spent), income: avg((t) => t.income), saved: avg((t) => t.net) };
  return {
    spent: { now: cur.spent, base: base.spent, change: rel(cur.spent, base.spent) },
    income: { now: cur.income, base: base.income, change: rel(cur.income, base.income) },
    saved: { now: cur.net, base: base.saved, change: rel(cur.net, base.saved) },
  };
}

// ---- Categories -----------------------------------------------------------------------------

export type CategoryMover = {
  categoryId: string;
  spent: number;
  /** the baseline level: average of the compared months (months with no spend count as 0) */
  base: number;
  /** spent vs base; null when there is nothing to compare with */
  change: number | null;
  budget: number;
  status: BudgetStatus;
};

/** Every expense category with spend this month or in the baseline, biggest this month first. */
export function categoryMovers(rows: LedgerRow[], month: ISODate, today: ISODate, budgets: Map<string, ResolvedBudget>, vs: CompareBase = "avg"): CategoryMover[] {
  const m = monthStart(month);
  const now = byCategory(rows, m, today);
  const months = baseMonths(m, vs);
  const prior = months.map((x) => byCategory(rows, x, today));
  const ids = new Set([...now.map((c) => c.categoryId), ...prior.flat().map((c) => c.categoryId)]);
  const out: CategoryMover[] = [];
  for (const id of ids) {
    const spent = now.find((c) => c.categoryId === id)?.spent ?? 0;
    const base = round2(prior.reduce((a, list) => a + (list.find((x) => x.categoryId === id)?.spent ?? 0), 0) / months.length);
    if (spent <= 0 && base <= 0) continue;
    const budget = budgets.get(id)?.amount ?? 0;
    out.push({ categoryId: id, spent, base, change: base > 0 ? (spent - base) / base : null, budget, status: budget > 0 ? budgetStatus(spent, budget) : "none" });
  }
  return out.sort((a, b) => b.spent - a.spent || b.base - a.base);
}

// ---- Forecast -------------------------------------------------------------------------------

export type Forecast = {
  /** day of the month today is (1-based) and the month's length */
  day: number;
  days: number;
  /** spent so far (posted entries only) */
  posted: number;
  /** future-dated entries already booked for the rest of the month (EMIs, scheduled expenses) */
  scheduledLeft: number;
  /** everyday (core) spend per day so far, left out of plans and scheduled entries */
  pace: number;
  /** posted + scheduled + pace for the days still to come */
  projected: number;
  /** total monthly budget, 0 when none is set */
  budget: number;
  /** what is left per remaining day to finish on budget; negative when already past it; null without a budget or days left */
  safePerDay: number | null;
  daysLeft: number;
  /** projected vs budget */
  status: BudgetStatus;
  /** too few days of data for the pace to mean anything */
  early: boolean;
  /** running total by day this month (to today) and for the month before (whole month) */
  cumulative: number[];
  lastMonth: number[];
};

const MIN_DAYS = 3;

/** Cumulative posted spend by day: index 0 is day 1. Stops at `through` (a day number). */
export function cumulativeSpend(rows: LedgerRow[], month: ISODate, through: number): number[] {
  const m = monthStart(month);
  const byDay = Array<number>(through).fill(0);
  for (const r of rows) {
    if (r.month !== m || r.is_scheduled || r.type === "income") continue;
    const d = Number(r.entry_date.slice(8, 10));
    if (d >= 1 && d <= through) byDay[d - 1] += Number(r.spend);
  }
  let run = 0;
  return byDay.map((v) => (run = round2(run + v)));
}

/**
 * Where this month is heading. Posted spend + what is already booked for later + everyday spending at its pace so far.
 * Only meaningful for the current month, so it returns null for any other.
 */
export function forecastMonth(rows: LedgerRow[], month: ISODate, today: ISODate, budgetTotal: number): Forecast | null {
  const m = monthStart(month);
  if (m !== monthStart(today)) return null;
  const day = Number(today.slice(8, 10));
  const days = daysInMonth(m);
  const inMonth = rows.filter((r) => r.month === m && r.type !== "income");
  const posted = round2(inMonth.filter((r) => !r.is_scheduled).reduce((a, r) => a + Number(r.spend), 0));
  const scheduledLeft = round2(inMonth.filter((r) => r.is_scheduled).reduce((a, r) => a + Number(r.spend), 0));
  const core = inMonth.filter((r) => !r.is_scheduled && !r.plan_kind && r.is_core).reduce((a, r) => a + Number(r.spend), 0);
  const pace = round2(core / day);
  const daysLeft = days - day;
  const projected = round2(posted + scheduledLeft + pace * daysLeft);
  const prev = addMonths(m, -1);
  const room = budgetTotal - posted - scheduledLeft;
  return {
    day,
    days,
    posted,
    scheduledLeft,
    pace,
    projected,
    budget: budgetTotal,
    safePerDay: budgetTotal > 0 && daysLeft > 0 ? round2(room / daysLeft) : null,
    daysLeft,
    status: budgetTotal > 0 ? budgetStatus(projected, budgetTotal) : "none",
    early: day < MIN_DAYS,
    cumulative: cumulativeSpend(rows, m, day),
    lastMonth: cumulativeSpend(rows, prev, daysInMonth(prev)),
  };
}

// ---- Merchants ------------------------------------------------------------------------------

export type MerchantRow = { merchantId: string; name: string; spent: number; count: number; avg: number; isNew: boolean };

/** Spend by merchant this month, with the usual monthly level (prior 3 months) and a "new" flag. */
export function merchantRows(rows: LedgerRow[], month: ISODate, today: ISODate, limit = 8): MerchantRow[] {
  const m = monthStart(month);
  const cur = new Map<string, MerchantRow>();
  for (const r of countable(rows.filter((x) => x.month === m && x.type !== "income" && x.merchant_id), m, today)) {
    const e = cur.get(r.merchant_id) ?? { merchantId: r.merchant_id, name: r.merchant_name ?? "", spent: 0, count: 0, avg: 0, isNew: false };
    e.spent += Number(r.spend);
    e.count += 1;
    cur.set(r.merchant_id, e);
  }
  const from = addMonths(m, -3);
  const prior = new Map<string, number>();
  for (const r of rows) {
    if (r.month < from || r.month >= m || r.type === "income" || !r.merchant_id || r.is_scheduled) continue;
    prior.set(r.merchant_id, (prior.get(r.merchant_id) ?? 0) + Number(r.spend));
  }
  return [...cur.values()]
    .map((e) => ({ ...e, spent: round2(e.spent), avg: round2((prior.get(e.merchantId) ?? 0) / 3), isNew: !prior.has(e.merchantId) }))
    .filter((e) => e.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, limit);
}

// ---- Recurring charges ----------------------------------------------------------------------

export type RecurringCharge = { merchantId: string; name: string; typical: number; months: number; lastDate: ISODate };

/**
 * Likely subscriptions and bills: a merchant charged in at least 3 of the 4 months ending at `month`,
 * with the charge staying within 20% of its usual size. Plans/EMIs are already tracked on their own, so they are left out.
 */
export function recurringCharges(rows: LedgerRow[], month: ISODate, today: ISODate): RecurringCharge[] {
  const m = monthStart(month);
  const window = [0, 1, 2, 3].map((i) => addMonths(m, -i));
  const byMerchant = new Map<string, { name: string; perMonth: Map<string, number>; last: ISODate }>();
  for (const r of rows) {
    if (!window.includes(r.month) || r.type !== "expense" || !r.merchant_id || r.plan_kind || r.is_scheduled || r.entry_date > today) continue;
    const e = byMerchant.get(r.merchant_id) ?? { name: r.merchant_name ?? "", perMonth: new Map(), last: "" };
    e.perMonth.set(r.month, (e.perMonth.get(r.month) ?? 0) + Number(r.spend));
    if (r.entry_date > e.last) e.last = r.entry_date;
    byMerchant.set(r.merchant_id, e);
  }
  const out: RecurringCharge[] = [];
  for (const [merchantId, e] of byMerchant) {
    const amounts = [...e.perMonth.values()];
    if (amounts.length < 3) continue;
    const typical = median(amounts);
    if (typical <= 0 || !amounts.every((a) => Math.abs(a - typical) <= typical * 0.2)) continue;
    out.push({ merchantId, name: e.name, typical: round2(typical), months: amounts.length, lastDate: e.last });
  }
  return out.sort((a, b) => b.typical - a.typical);
}

// ---- Spending rhythm ------------------------------------------------------------------------

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type Rhythm = {
  /** average spend per day of the week (Mon first) over the last 3 months to date */
  weekdays: { label: (typeof WEEKDAYS)[number]; avg: number }[];
  busiest: (typeof WEEKDAYS)[number] | null;
  /** this month, to date */
  perDay: number;
  noSpendDays: number;
  daysElapsed: number;
  avgTxn: number;
  count: number;
  biggest: { label: string; amount: number; date: ISODate } | null;
};

const dayIndex = (iso: ISODate) => (parseISO(iso).getDay() + 6) % 7; // Mon = 0

/** Everyday behaviour: which weekdays cost most, how many days passed with nothing spent, typical purchase size. Plans/EMIs are not behaviour, so they are skipped. */
export function spendingRhythm(rows: LedgerRow[], month: ISODate, today: ISODate): Rhythm {
  const m = monthStart(month);
  const past = m < monthStart(today);
  const futureMonth = m > monthStart(today);
  const daysElapsed = futureMonth ? 0 : past ? daysInMonth(m) : Number(today.slice(8, 10));
  const everyday = (r: LedgerRow) => r.type === "expense" && !r.plan_kind && !r.is_scheduled;

  const inMonth = rows.filter((r) => r.month === m && everyday(r) && r.entry_date <= (past ? "9999" : today));
  const spendDays = new Set(inMonth.map((r) => r.entry_date));
  const total = inMonth.reduce((a, r) => a + Number(r.spend), 0);
  const biggestRow = [...inMonth].sort((a, b) => Number(b.spend) - Number(a.spend))[0];

  // weekday profile: the 3 months ending at `month`, capped at today
  const from = addMonths(m, -2);
  const end = past ? `${m.slice(0, 7)}-${String(daysInMonth(m)).padStart(2, "0")}` : today;
  const totals = Array<number>(7).fill(0);
  for (const r of rows) {
    if (!everyday(r) || r.entry_date < from || r.entry_date > end) continue;
    totals[dayIndex(r.entry_date)] += Number(r.spend);
  }
  const occurrences = Array<number>(7).fill(0);
  for (let d = parseISO(from); d <= parseISO(end); d.setDate(d.getDate() + 1)) occurrences[(d.getDay() + 6) % 7] += 1;
  const weekdays = WEEKDAYS.map((label, i) => ({ label, avg: occurrences[i] ? round2(totals[i] / occurrences[i]) : 0 }));
  const top = weekdays.reduce((best, w) => (w.avg > best.avg ? w : best), weekdays[0]);

  return {
    weekdays,
    busiest: top.avg > 0 ? top.label : null,
    perDay: daysElapsed ? round2(total / daysElapsed) : 0,
    noSpendDays: Math.max(0, daysElapsed - spendDays.size),
    daysElapsed,
    avgTxn: inMonth.length ? round2(total / inMonth.length) : 0,
    count: inMonth.length,
    biggest: biggestRow ? { label: biggestRow.merchant_name || biggestRow.description || "Expense", amount: Number(biggestRow.spend), date: biggestRow.entry_date } : null,
  };
}
