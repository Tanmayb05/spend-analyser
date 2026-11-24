import { describe, expect, it } from "vitest";
import { minDueRule, minimumDue, summarizeCard, type CardConfig, type CardSummary, type Statement } from "@/lib/cards";
import { aiNotices, applyState, budgetNotices, cardNotices, committedNotice, emiNotices, tripNotices, type AiInputs } from "@/lib/notifications/rules";
import type { LedgerRow } from "@/lib/data/types";

const money = (n: number) => `$${Math.round(n)}`;
const TODAY = "2026-11-18";

const card = (over: Partial<CardConfig> = {}): CardConfig => ({
  id: "c1",
  name: "Visa",
  credit_limit: 1000,
  statement_day: 5,
  due_day: 25,
  opening_balance: 0,
  tracking_from: null,
  ...over,
});

const summary = (statement: Partial<Statement> | null, over: Partial<CardSummary> = {}): CardSummary => ({
  card: card(),
  outstanding: 100,
  available: 900,
  utilization: 0.1,
  unbilled: 0,
  emiLocked: 0,
  cycle: null,
  statement: statement
    ? { closing: "2026-11-05", due: "2026-11-25", amount: 500, emiBilled: 0, minDue: 25, paid: 0, remaining: 500, status: "due", ...statement }
    : null,
  history: [],
  ...over,
});

describe("minimumDue", () => {
  it("takes the larger of pct and floor, plus all EMI billed", () => {
    expect(minimumDue(10000, 0, { pct: 5, floor: 200 })).toBe(500);
    expect(minimumDue(1000, 0, { pct: 5, floor: 200 })).toBe(200);
    expect(minimumDue(10000, 3000, { pct: 5, floor: 200 })).toBe(3350);
  });
  it("never exceeds the bill and is 0 for an empty bill", () => {
    expect(minimumDue(100, 0, { pct: 5, floor: 200 })).toBe(100);
    expect(minimumDue(0, 0, { pct: 5, floor: 200 })).toBe(0);
    expect(minimumDue(500, 500, { pct: 5, floor: 200 })).toBe(500);
  });
  it("defaults by currency and lets settings override", () => {
    expect(minDueRule("INR")).toEqual({ pct: 5, floor: 200 });
    expect(minDueRule("USD")).toEqual({ pct: 3, floor: 25 });
    expect(minDueRule("INR", 2, null)).toEqual({ pct: 2, floor: 200 });
  });
  it("is part of the statement, with EMI installments billed in that cycle", () => {
    const charges = [
      { id: "a", date: "2026-10-10", amount: 1000 },
      {
        id: "e",
        date: "2026-10-01",
        amount: 900,
        emi: [
          { due_date: "2026-10-20", amount: 300 },
          { due_date: "2026-11-20", amount: 300 },
          { due_date: "2026-12-20", amount: 300 },
        ],
      },
    ];
    const s = summarizeCard({ ...card({ credit_limit: 5000 }), min_due: { pct: 5, floor: 25 } }, charges, [], TODAY).statement!;
    expect(s.amount).toBe(1300);
    expect(s.emiBilled).toBe(300);
    expect(s.minDue).toBe(350);
  });
});

describe("card notices", () => {
  it("warns a week out and turns urgent (new id) inside 2 days when the minimum is unpaid", () => {
    const week = cardNotices([summary({ due: "2026-11-24" })], TODAY, money);
    expect(week).toMatchObject([{ kind: "card-due-soon", tone: "warn", id: "card-due|c1|2026-11-24" }]);
    const urgent = cardNotices([summary({ due: "2026-11-20" })], TODAY, money);
    expect(urgent).toMatchObject([{ kind: "card-min-due", tone: "bad", id: "card-due|c1|2026-11-20|urgent" }]);
  });
  it("stays a warning near the due date once the minimum is covered", () => {
    const n = cardNotices([summary({ due: "2026-11-19", paid: 50, remaining: 450 })], TODAY, money);
    expect(n[0]).toMatchObject({ tone: "warn", kind: "card-due-soon" });
    expect(n[0].detail).toMatch(/avoid interest/);
  });
  it("overdue: bad when the minimum was missed, interest warning when it was paid", () => {
    expect(cardNotices([summary({ due: "2026-11-10", status: "overdue" })], TODAY, money)[0]).toMatchObject({ kind: "card-overdue", tone: "bad" });
    expect(cardNotices([summary({ due: "2026-11-10", status: "overdue", paid: 30, remaining: 470 })], TODAY, money)[0]).toMatchObject({ kind: "card-min-due", tone: "warn" });
  });
  it("announces a fresh statement, and says nothing for a paid one", () => {
    expect(cardNotices([summary({ closing: "2026-11-16", due: "2026-12-06" })], TODAY, money)[0]).toMatchObject({ kind: "card-statement-ready", id: "card-stmt|c1|2026-11-16" });
    expect(cardNotices([summary({ status: "paid", remaining: 0, paid: 500, due: "2026-11-20" })], TODAY, money)).toEqual([]);
  });
  it("flags utilisation over 30% (warn) and 50% (bad), plus overall across cards", () => {
    expect(cardNotices([summary(null, { utilization: 0.25 })], TODAY, money)).toEqual([]);
    expect(cardNotices([summary(null, { utilization: 0.4 })], TODAY, money)[0]).toMatchObject({ tone: "warn", id: "card-util|c1|2026-11-01|fair" });
    expect(cardNotices([summary(null, { utilization: 0.6 })], TODAY, money)[0]).toMatchObject({ tone: "bad", id: "card-util|c1|2026-11-01|high" });
    const two = [summary(null, { utilization: 0.6, outstanding: 600 }), summary(null, { card: card({ id: "c2", name: "Amex" }), utilization: 0.2, outstanding: 200 })];
    expect(cardNotices(two, TODAY, money).map((n) => n.id)).toContain("card-util-all|2026-11-01|fair");
  });
});

describe("budget, plans, trips", () => {
  it("budget: near at 80%, over above 100%, ignores categories without a budget", () => {
    const n = budgetNotices(
      [
        { categoryId: "a", name: "Dining", spent: 90, budget: 100 },
        { categoryId: "b", name: "Shopping", spent: 120, budget: 100 },
        { categoryId: "c", name: "Fuel", spent: 50, budget: 100 },
        { categoryId: "d", name: "Gifts", spent: 50, budget: 0 },
      ],
      "2026-11-01",
      TODAY,
      money,
    );
    expect(n.map((x) => [x.id, x.tone])).toEqual([
      ["budget|a|2026-11-01|near", "warn"],
      ["budget|b|2026-11-01|over", "bad"],
    ]);
  });
  it("next month committed above 70%", () => {
    expect(committedNotice(60, 100, "2026-12-01", TODAY, money)).toEqual([]);
    expect(committedNotice(75, 100, "2026-12-01", TODAY, money)[0]).toMatchObject({ tone: "warn", id: "committed|2026-12-01|high" });
    expect(committedNotice(110, 100, "2026-12-01", TODAY, money)[0]).toMatchObject({ tone: "bad" });
  });
  it("installments due within 5 days", () => {
    const row = (entry_date: string, extra: Partial<LedgerRow> = {}) =>
      ({ txn_id: "t1", entry_date, installment_seq: 3, installment_count: 12, is_lump: false, type: "expense", amount: 100, merchant_name: "Laptop", plan_kind: "emi", ...extra }) as LedgerRow;
    const n = emiNotices([row("2026-11-20"), row("2026-11-30"), row("2026-11-21", { installment_seq: null as unknown as number })], TODAY, money);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ id: "emi|t1|2026-11-20", href: "/transactions?tab=plans" });
  });
  it("trips starting tomorrow or ended in the last 3 days", () => {
    const n = tripNotices(
      [
        { id: "a", name: "Goa", start_date: "2026-11-19", end_date: "2026-11-25" },
        { id: "b", name: "Pune", start_date: "2026-11-10", end_date: "2026-11-16" },
        { id: "c", name: "Old", start_date: "2026-10-01", end_date: "2026-10-05" },
      ],
      TODAY,
    );
    expect(n.map((x) => x.id)).toEqual(["trip-start|a", "trip-end|b"]);
  });
});

describe("ai notices", () => {
  const base: AiInputs = { aiReady: true, review: null, flags: { count: 0, duplicates: 0, newestId: null }, tidy: 0, allowance: [], errors24h: 0 };
  it("offers to write last month's review, or shows the cached one", () => {
    expect(aiNotices({ ...base, review: { month: "2026-10-01", cached: null, left: 4 } }, TODAY)[0]).toMatchObject({ id: "review|2026-10-01", action: { kind: "write-review" } });
    const done = aiNotices({ ...base, review: { month: "2026-10-01", cached: { headline: "H", summary: "S" }, left: 4 } }, TODAY)[0];
    expect(done).toMatchObject({ tone: "good", detail: "H" });
    expect(done.action).toBeUndefined();
    expect(aiNotices({ ...base, aiReady: false, review: { month: "2026-10-01", cached: null, left: 4 } }, TODAY)).toEqual([]);
  });
  it("flags, tidy backlog, low allowance and errors", () => {
    const n = aiNotices(
      {
        ...base,
        flags: { count: 3, duplicates: 2, newestId: "f9" },
        tidy: 12,
        allowance: [
          { group: "chat", unit: "questions", used: 29, limit: 30, left: 1 },
          { group: "parse", unit: "smart entries", used: 2, limit: 50, left: 48 },
        ],
        errors24h: 2,
      },
      TODAY,
    );
    expect(n.map((x) => x.kind)).toEqual(["ai-flags", "tidy-backlog", "ai-allowance", "ai-errors"]);
    expect(n[0]).toMatchObject({ id: "flags|f9" });
    expect(n[2].title).toBe("1 AI question left this month");
  });
});

describe("applyState", () => {
  const n = (id: string) => ({ id, kind: "budget" as const, group: "budget" as const, tone: "warn" as const, title: id, at: TODAY });
  it("drops dismissed and still-snoozed notices, marks read, removes duplicate ids", () => {
    const out = applyState(
      [n("a"), n("b"), n("c"), n("d"), n("a")],
      [
        { notice_id: "a", read_at: "2026-11-17T00:00:00Z", dismissed_at: null, snoozed_until: null },
        { notice_id: "b", read_at: null, dismissed_at: "2026-11-17T00:00:00Z", snoozed_until: null },
        { notice_id: "c", read_at: null, dismissed_at: null, snoozed_until: "2026-11-20" },
        { notice_id: "d", read_at: null, dismissed_at: null, snoozed_until: "2026-11-18" },
      ],
      TODAY,
    );
    expect(out.map((x) => [x.id, x.read])).toEqual([
      ["a", true],
      ["d", false],
    ]);
  });
});
