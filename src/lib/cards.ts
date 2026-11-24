// Credit-card maths: billing cycles, balances, statements and utilization. Pure functions (unit-tested).
// All amounts are in the base currency. Card payments (bill setoffs) live outside the ledger, so they
// never count as spend; they only reduce what is owed on the card.

import { addMonths, daysInMonth, monthStart, parseISO, toISO, type ISODate } from "@/lib/dates";
import { round2 } from "@/lib/utils";

export type CardConfig = {
  id: string;
  name: string;
  credit_limit: number | null;
  statement_day: number | null;
  due_day: number | null;
  opening_balance: number;
  /** charges before this date are assumed to be inside opening_balance; null = count everything */
  tracking_from: ISODate | null;
  /** minimum-due rule; resolved from the card's settings or the currency default (see minDueRule) */
  min_due?: MinDueRule;
};

/** Minimum amount due: pct of the non-EMI part of the bill (at least `floor`), plus 100% of EMI installments billed. */
export type MinDueRule = { pct: number; floor: number };

/**
 * Banks don't share one formula. Indian issuers commonly bill max(5% of the non-EMI balance, ~₹200) plus all EMIs;
 * US issuers roughly 1-3% plus interest and fees, floored at $25-35. We have no interest/fee data, so the defaults
 * lean high to warn early. Card settings override either part.
 */
export function minDueRule(currency: string, pct?: number | null, floor?: number | null): MinDueRule {
  const inr = currency === "INR";
  return { pct: pct ?? (inr ? 5 : 3), floor: floor ?? (inr ? 200 : 25) };
}

/** min(bill, max(pct x (bill - EMI billed), floor) + EMI billed). Never above the bill, 0 for an empty bill. */
export function minimumDue(amount: number, emiBilled: number, rule: MinDueRule): number {
  if (amount <= 0) return 0;
  const emi = Math.min(Math.max(0, emiBilled), amount);
  const base = Math.max(0, amount - emi);
  const part = base > 0 ? Math.max((rule.pct / 100) * base, rule.floor) : 0;
  return round2(Math.min(amount, part + emi));
}

/** One transaction on the card. `amount` is signed: purchases add, refunds and credits subtract. */
export type CardCharge = {
  id: string;
  date: ISODate;
  amount: number;
  /** EMI purchases: the bank bills these installments instead of the full amount */
  emi?: { due_date: ISODate; amount: number }[];
};

export type CardPayment = { id: string; date: ISODate; amount: number; note?: string | null };

export type Statement = {
  closing: ISODate;
  due: ISODate;
  /** what the statement asks for: billed balance at closing (never below 0) */
  amount: number;
  /** EMI installments that fell due in this statement's cycle (billed in full, part of the minimum) */
  emiBilled: number;
  /** estimated minimum amount due (see minimumDue) */
  minDue: number;
  /** payments made after closing, up to today */
  paid: number;
  remaining: number;
  status: "paid" | "due" | "overdue";
};

export type CardSummary = {
  card: CardConfig;
  /** owed right now, including EMI principal not yet billed */
  outstanding: number;
  available: number | null;
  utilization: number | null;
  /** spent in the open cycle (since the last statement closed) */
  unbilled: number;
  emiLocked: number;
  cycle: { start: ISODate; closing: ISODate; due: ISODate } | null;
  statement: Statement | null;
  history: { month: ISODate; balance: number; utilization: number | null }[];
};

const addDays = (d: ISODate, n: number): ISODate => {
  const x = parseISO(d);
  x.setDate(x.getDate() + n);
  return toISO(x);
};

/** The date `day` falls on in `month`, clamped to the month's last day (31 → Feb 28). */
export function dayIn(month: ISODate, day: number): ISODate {
  const d = Math.min(day, daysInMonth(monthStart(month)));
  return `${month.slice(0, 7)}-${String(d).padStart(2, "0")}`;
}

/** Statement closing date on or before `date`. */
export function closingOnOrBefore(date: ISODate, statementDay: number): ISODate {
  const here = dayIn(date, statementDay);
  return here <= date ? here : dayIn(addMonths(monthStart(date), -1), statementDay);
}

/** Payment due date for a statement that closes on `closing`: the next `dueDay` after it. */
export function dueFor(closing: ISODate, dueDay: number): ISODate {
  const same = dayIn(closing, dueDay);
  return same > closing ? same : dayIn(addMonths(monthStart(closing), 1), dueDay);
}

const counts = (card: CardConfig, d: ISODate) => !card.tracking_from || d >= card.tracking_from;

/** Owed at the end of `date`, with EMI purchases counted in full (that's what blocks the limit). */
export function balanceAt(card: CardConfig, charges: CardCharge[], payments: CardPayment[], date: ISODate): number {
  let b = card.opening_balance;
  for (const c of charges) if (c.date <= date && counts(card, c.date)) b += c.amount;
  for (const p of payments) if (p.date <= date && counts(card, p.date)) b -= p.amount;
  return round2(b);
}

/** Owed per the bank's statements at the end of `date`: EMI purchases count only their installments due so far. */
export function billedAt(card: CardConfig, charges: CardCharge[], payments: CardPayment[], date: ISODate): number {
  let b = card.opening_balance;
  for (const c of charges) {
    if (!counts(card, c.date)) continue;
    if (c.emi?.length) {
      for (const i of c.emi) if (i.due_date <= date) b += i.amount;
    } else if (c.date <= date) b += c.amount;
  }
  for (const p of payments) if (p.date <= date && counts(card, p.date)) b -= p.amount;
  return round2(b);
}

export function summarizeCard(card: CardConfig, charges: CardCharge[], payments: CardPayment[], today: ISODate, months = 12): CardSummary {
  const outstanding = balanceAt(card, charges, payments, today);
  const limit = card.credit_limit && card.credit_limit > 0 ? card.credit_limit : null;
  const util = (b: number) => (limit ? Math.max(0, b) / limit : null);

  const emiLocked = round2(outstanding - billedAt(card, charges, payments, today));

  let cycle: CardSummary["cycle"] = null;
  let statement: Statement | null = null;
  let unbilled = 0;
  if (card.statement_day) {
    const dueDay = card.due_day ?? card.statement_day;
    // a statement closes at the end of its day, so on the closing day itself the cycle is still open
    const lastClosing = closingOnOrBefore(addDays(today, -1), card.statement_day);
    const nextClosing = dayIn(addMonths(monthStart(lastClosing), 1), card.statement_day);
    cycle = { start: addDays(lastClosing, 1), closing: nextClosing, due: dueFor(nextClosing, dueDay) };
    unbilled = round2(
      charges.filter((c) => c.date > lastClosing && c.date <= today && counts(card, c.date) && !c.emi?.length).reduce((a, c) => a + c.amount, 0),
    );

    // the latest statement is only meaningful once tracking had started by its closing date
    if (!card.tracking_from || lastClosing >= card.tracking_from) {
      const amount = Math.max(0, billedAt(card, charges, payments, lastClosing));
      const paid = round2(payments.filter((p) => p.date > lastClosing && p.date <= today).reduce((a, p) => a + p.amount, 0));
      const remaining = round2(Math.max(0, amount - paid));
      const due = dueFor(lastClosing, dueDay);
      const prevClosing = dayIn(addMonths(monthStart(lastClosing), -1), card.statement_day);
      const emiBilled = round2(
        charges.filter((c) => counts(card, c.date)).reduce((a, c) => a + (c.emi ?? []).filter((i) => i.due_date > prevClosing && i.due_date <= lastClosing).reduce((x, i) => x + i.amount, 0), 0),
      );
      const minDue = minimumDue(amount, emiBilled, card.min_due ?? minDueRule(""));
      statement = { closing: lastClosing, due, amount: round2(amount), emiBilled, minDue, paid, remaining, status: remaining <= 0 ? "paid" : today <= due ? "due" : "overdue" };
    }
  }

  const history: CardSummary["history"] = [];
  for (let i = months - 1; i >= 0; i--) {
    const month = addMonths(monthStart(today), -i);
    const end = i === 0 ? today : addDays(addMonths(month, 1), -1);
    if (card.tracking_from && end < card.tracking_from) continue;
    const b = balanceAt(card, charges, payments, end);
    history.push({ month, balance: b, utilization: util(b) });
  }

  return {
    card,
    outstanding,
    available: limit ? round2(limit - outstanding) : null,
    utilization: util(outstanding),
    unbilled,
    emiLocked,
    cycle,
    statement,
    history,
  };
}

export type UtilBand = { label: string; tone: "good" | "warn" | "bad" };

/** Score-model bands: under 10% is ideal, under 30% is the usual advice, over 50% hurts. */
export function utilBand(u: number): UtilBand {
  if (u <= 0.1) return { label: "Excellent", tone: "good" };
  if (u <= 0.3) return { label: "Good", tone: "good" };
  if (u <= 0.5) return { label: "Fair", tone: "warn" };
  return { label: "High", tone: "bad" };
}

/** Across all cards that have a limit. */
export function overallUtilization(cards: CardSummary[]): { outstanding: number; limit: number; utilization: number | null } {
  const withLimit = cards.filter((c) => c.card.credit_limit);
  const limit = withLimit.reduce((a, c) => a + (c.card.credit_limit ?? 0), 0);
  const outstanding = round2(withLimit.reduce((a, c) => a + Math.max(0, c.outstanding), 0));
  return { outstanding, limit, utilization: limit ? outstanding / limit : null };
}

/** The `n` most recently used cards, newest first. Cards never used sort last, by name. */
export function recentlyUsed<T extends { name: string; lastUsed: string | null }>(cards: T[], n: number): T[] {
  return [...cards]
    .sort((a, b) => (a.lastUsed && b.lastUsed ? b.lastUsed.localeCompare(a.lastUsed) : a.lastUsed ? -1 : b.lastUsed ? 1 : 0) || a.name.localeCompare(b.name))
    .slice(0, n);
}
