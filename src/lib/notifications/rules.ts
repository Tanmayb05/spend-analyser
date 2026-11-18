// Notification rules: pure functions that turn already-loaded data into notices (unit-tested).
// Every id is stable and scoped to its period, so read/dismiss state sticks to one occurrence and the
// next cycle (next statement, next month, a worse band) shows up as a new notice.

import type { CardSummary } from "@/lib/cards";
import { overallUtilization } from "@/lib/cards";
import type { Insight } from "@/lib/analytics/insights";
import type { LedgerRow } from "@/lib/data/types";
import { formatDay, formatMonth, monthStart, parseISO, relativeDays, toISO, type ISODate } from "@/lib/dates";
import { formatPercent } from "@/lib/money";
import type { Notice } from "./types";

type Money = (n: number) => string;

const addDays = (d: ISODate, n: number): ISODate => {
  const x = parseISO(d);
  x.setDate(x.getDate() + n);
  return toISO(x);
};
const daysBetween = (from: ISODate, to: ISODate) => Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000);

const CARDS_HREF = "/transactions?tab=cards";
export const DUE_SOON_DAYS = 7;
export const URGENT_DAYS = 2;
export const STATEMENT_FRESH_DAYS = 3;

// ---------------------------------------------------------------------------------------------
// Credit cards
// ---------------------------------------------------------------------------------------------

export function cardNotices(cards: CardSummary[], today: ISODate, money: Money): Notice[] {
  const out: Notice[] = [];
  const pay = { label: "Log payment", href: CARDS_HREF };

  for (const c of cards) {
    const { card, statement: s } = c;
    if (s && s.status !== "paid" && s.remaining > 0) {
      const minMet = s.paid >= s.minDue;
      const days = daysBetween(today, s.due);
      if (s.status === "overdue") {
        out.push(
          minMet
            ? {
                id: `card-interest|${card.id}|${s.due}`,
                kind: "card-min-due",
                group: "cards",
                tone: "warn",
                title: `Interest coming on ${card.name}`,
                detail: `Minimum paid, but ${money(s.remaining)} was still unpaid on the due date. Interest accrues on it until it's cleared.`,
                at: s.due,
                href: CARDS_HREF,
                action: pay,
              }
            : {
                id: `card-overdue|${card.id}|${s.due}`,
                kind: "card-overdue",
                group: "cards",
                tone: "bad",
                title: `${card.name} bill is overdue`,
                detail: `${s.paid > 0 ? `Paid ${money(s.paid)} of the ~${money(s.minDue)} minimum` : `Minimum ~${money(s.minDue)} not paid`}. Expect a late fee and a credit score hit. ${money(s.remaining)} still owed.`,
                at: s.due,
                href: CARDS_HREF,
                action: pay,
              },
        );
      } else if (days <= DUE_SOON_DAYS) {
        const urgent = !minMet && days <= URGENT_DAYS;
        out.push({
          // urgency is part of the id, so a notice read a week out comes back unread when it turns urgent
          id: `card-due|${card.id}|${s.due}${urgent ? "|urgent" : ""}`,
          kind: urgent ? "card-min-due" : "card-due-soon",
          group: "cards",
          tone: urgent ? "bad" : "warn",
          title: `${card.name} due ${relativeDays(s.due, today)}`,
          detail: minMet
            ? `Minimum covered. Pay the remaining ${money(s.remaining)} by ${formatDay(s.due)} to avoid interest.`
            : `${money(s.remaining)} left · minimum ~${money(s.minDue)}${s.paid > 0 ? ` (${money(s.minDue - s.paid)} more)` : ""}`,
          at: s.due,
          href: CARDS_HREF,
          action: pay,
        });
      } else if (daysBetween(s.closing, today) <= STATEMENT_FRESH_DAYS) {
        out.push({
          id: `card-stmt|${card.id}|${s.closing}`,
          kind: "card-statement-ready",
          group: "cards",
          tone: "neutral",
          title: `${card.name} statement: ${money(s.amount)}`,
          detail: `Due ${formatDay(s.due)} · minimum ~${money(s.minDue)}`,
          at: s.closing,
          href: CARDS_HREF,
        });
      }
    }

    if (c.utilization !== null && c.utilization > 0.3) {
      const high = c.utilization > 0.5;
      out.push({
        id: `card-util|${card.id}|${monthStart(today)}|${high ? "high" : "fair"}`,
        kind: "card-utilization",
        group: "cards",
        tone: high ? "bad" : "warn",
        title: `${card.name} utilisation at ${formatPercent(c.utilization)}`,
        detail: high ? "Above 50% can lower your credit score. Paying down before the statement date helps most." : "Above the usual 30% guide. Under 30% (ideally under 10%) is best for your score.",
        at: today,
        href: CARDS_HREF,
      });
    }
  }

  const withLimit = cards.filter((c) => c.card.credit_limit);
  const all = overallUtilization(cards);
  if (withLimit.length > 1 && all.utilization !== null && all.utilization > 0.3) {
    const high = all.utilization > 0.5;
    out.push({
      id: `card-util-all|${monthStart(today)}|${high ? "high" : "fair"}`,
      kind: "card-utilization",
      group: "cards",
      tone: high ? "bad" : "warn",
      title: `Overall card utilisation at ${formatPercent(all.utilization)}`,
      detail: `${money(all.outstanding)} owed across ${withLimit.length} cards with a ${money(all.limit)} total limit.`,
      at: today,
      href: CARDS_HREF,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Budgets, insights, plans
// ---------------------------------------------------------------------------------------------

export type BudgetLine = { categoryId: string; name: string; spent: number; budget: number };

/** Current month only: categories at 80%+ (warn) or over 100% (bad) of their budget. */
export function budgetNotices(lines: BudgetLine[], month: ISODate, today: ISODate, money: Money): Notice[] {
  const out: Notice[] = [];
  const end = new Date(parseISO(month).getFullYear(), parseISO(month).getMonth() + 1, 0);
  const left = Math.max(0, daysBetween(today, toISO(end)) + 1);
  for (const l of lines) {
    if (!(l.budget > 0)) continue;
    const r = l.spent / l.budget;
    if (r < 0.8) continue;
    const over = r > 1;
    out.push({
      id: `budget|${l.categoryId}|${month}|${over ? "over" : "near"}`,
      kind: "budget",
      group: "budget",
      tone: over ? "bad" : "warn",
      title: over ? `${l.name} is over budget` : `${l.name} at ${formatPercent(r)} of budget`,
      detail: over ? `${money(l.spent)} of ${money(l.budget)} · ${formatPercent(r)}` : `${money(l.budget - l.spent)} left with ${left} day${left === 1 ? "" : "s"} to go`,
      at: today,
      href: `/transactions?${new URLSearchParams({ m: month.slice(0, 7), cat: l.categoryId })}`,
    });
  }
  return out;
}

/** Rule insights (the old overview banner). Neutral facts stay on the Insights page. */
export function insightNotices(insights: Insight[], month: ISODate, today: ISODate): Notice[] {
  return insights
    .filter((i) => i.tone !== "neutral")
    .map((i) => ({
      id: `insight|${i.id}|${month}`,
      kind: "rule-insight" as const,
      group: "budget" as const,
      tone: i.tone,
      title: i.text,
      at: today,
      href: "/insights",
    }));
}

export const EMI_SOON_DAYS = 5;

/** Installments (EMI or spread) due in the next few days. */
export function emiNotices(rows: LedgerRow[], today: ISODate, money: Money): Notice[] {
  const end = addDays(today, EMI_SOON_DAYS);
  return rows
    .filter((r) => r.installment_seq != null && !r.is_lump && r.type !== "income" && r.entry_date > today && r.entry_date <= end)
    .map((r) => ({
      id: `emi|${r.txn_id}|${r.entry_date}`,
      kind: "emi-upcoming" as const,
      group: "other" as const,
      tone: "neutral" as const,
      title: `${r.merchant_name || r.description || (r.plan_kind === "emi" ? "EMI" : "Instalment")} due ${relativeDays(r.entry_date, today)}`,
      detail: `${money(Number(r.amount))} · instalment ${r.installment_seq} of ${r.installment_count}`,
      at: r.entry_date,
      href: r.plan_kind === "emi" ? "/transactions?tab=emis" : "/transactions?tab=plans",
    }));
}

/** Next month's budget already eaten by EMIs and scheduled entries. */
export function committedNotice(committed: number, budget: number, nextMonth: ISODate, today: ISODate, money: Money): Notice[] {
  if (!(budget > 0)) return [];
  const r = committed / budget;
  if (r <= 0.7) return [];
  const over = r > 1;
  return [
    {
      id: `committed|${nextMonth}|${over ? "over" : "high"}`,
      kind: "next-month-committed",
      group: "budget",
      tone: over ? "bad" : "warn",
      title: `${formatMonth(nextMonth, "long").split(" ")[0]} is ${formatPercent(r)} committed`,
      detail: `${money(committed)} of the ${money(budget)} budget is already taken by EMIs and scheduled entries.`,
      at: today,
      href: "/transactions?tab=plans",
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// AI + housekeeping
// ---------------------------------------------------------------------------------------------

export type AiInputs = {
  aiReady: boolean;
  /** last month's review: null when last month had no activity */
  review: { month: ISODate; cached: { headline: string; summary: string } | null; left: number } | null;
  flags: { count: number; duplicates: number; newestId: string | null };
  tidy: number;
  allowance: { group: string; unit: string; left: number; used: number; limit: number }[];
  errors24h: number;
};

export const TIDY_MIN = 10;

export function aiNotices(a: AiInputs, today: ISODate): Notice[] {
  const out: Notice[] = [];
  const month = monthStart(today);

  if (a.review && (a.review.cached || a.aiReady)) {
    const label = formatMonth(a.review.month, "long").split(" ")[0];
    const r = a.review;
    out.push({
      id: `review|${r.month}`,
      kind: "month-review",
      group: "ai",
      tone: r.cached ? "good" : "neutral",
      title: `${label} in review`,
      detail: r.cached ? r.cached.headline : `A short AI review of ${label} is ready to write.`,
      at: today,
      review: { month: r.month, label, cached: r.cached, left: r.left },
      action: r.cached ? undefined : { label: `Write it · ${r.left} left`, kind: "write-review" },
    });
  }

  if (a.flags.count > 0 && a.flags.newestId) {
    const unusual = a.flags.count - a.flags.duplicates;
    const parts = [a.flags.duplicates ? `${a.flags.duplicates} possible duplicate${a.flags.duplicates === 1 ? "" : "s"}` : "", unusual ? `${unusual} unusual` : ""].filter(Boolean);
    out.push({
      id: `flags|${a.flags.newestId}`,
      kind: "ai-flags",
      group: "ai",
      tone: "warn",
      title: `${a.flags.count} transaction${a.flags.count === 1 ? "" : "s"} look${a.flags.count === 1 ? "s" : ""} off`,
      detail: `${parts.join(", ")}. Review or dismiss them on the Insights page.`,
      at: today,
      href: "/insights",
      action: { label: "Review", href: "/insights" },
    });
  }

  if (a.aiReady && a.tidy >= TIDY_MIN) {
    out.push({
      id: `tidy|${month}`,
      kind: "tidy-backlog",
      group: "ai",
      tone: "neutral",
      title: `${a.tidy} transactions could use a category check`,
      detail: "AI tidy-up can sort them in one go.",
      at: today,
      href: "/settings/tidy",
      action: { label: "Tidy up", href: "/settings/tidy" },
    });
  }

  if (a.aiReady) {
    for (const g of a.allowance) {
      if (g.limit <= 0 || g.used === 0 || g.left > 1) continue;
      out.push({
        id: `allowance|${g.group}|${month}|${g.left}`,
        kind: "ai-allowance",
        group: "ai",
        tone: "neutral",
        title: g.left === 0 ? `No AI ${g.unit} left this month` : `1 AI ${g.unit.replace(/s$/, "")} left this month`,
        detail: "Resets on the 1st.",
        at: today,
        href: "/settings/ai/usage",
      });
    }
  }

  if (a.errors24h > 0) {
    out.push({
      id: `ai-errors|${today}`,
      kind: "ai-errors",
      group: "ai",
      tone: "warn",
      title: `${a.errors24h} AI call${a.errors24h === 1 ? "" : "s"} failed in the last day`,
      detail: "Check your provider key or quota.",
      at: today,
      href: "/settings/ai/usage",
    });
  }
  return out;
}

export type TripLite = { id: string; name: string; start_date: string | null; end_date: string | null };

/** A trip starting tomorrow, or one that ended in the last 3 days (time to review the spend). */
export function tripNotices(trips: TripLite[], today: ISODate): Notice[] {
  const out: Notice[] = [];
  for (const t of trips) {
    if (t.start_date === addDays(today, 1)) {
      out.push({ id: `trip-start|${t.id}`, kind: "trip", group: "other", tone: "neutral", title: `${t.name} starts tomorrow`, detail: "Tag expenses to the trip to keep its budget on track.", at: t.start_date, href: `/trips/${t.id}` });
    }
    if (t.end_date && t.end_date < today && daysBetween(t.end_date, today) <= 3) {
      out.push({ id: `trip-end|${t.id}`, kind: "trip", group: "other", tone: "neutral", title: `${t.name} ended ${relativeDays(t.end_date, today)}`, detail: "Review what it cost and settle any splits.", at: t.end_date, href: `/trips/${t.id}` });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Saved state
// ---------------------------------------------------------------------------------------------

export type NoticeState = { notice_id: string; read_at: string | null; dismissed_at: string | null; snoozed_until: string | null };

/** Drop dismissed and still-snoozed notices, mark read ones, and order: unread first, then most relevant date. */
export function applyState(notices: Notice[], states: NoticeState[], today: ISODate): Notice[] {
  const byId = new Map(states.map((s) => [s.notice_id, s]));
  const seen = new Set<string>();
  return notices
    .filter((n) => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      const s = byId.get(n.id);
      return !s?.dismissed_at && !(s?.snoozed_until && s.snoozed_until > today);
    })
    .map((n) => ({ ...n, read: Boolean(byId.get(n.id)?.read_at) }));
}
