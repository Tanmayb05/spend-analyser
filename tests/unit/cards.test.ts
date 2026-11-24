import { describe, expect, it } from "vitest";
import { balanceAt, billedAt, closingOnOrBefore, dayIn, dueFor, overallUtilization, recentlyUsed, summarizeCard, utilBand, type CardConfig } from "@/lib/cards";

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

describe("cycle dates", () => {
  it("clamps the day to the month length", () => {
    expect(dayIn("2026-02-01", 31)).toBe("2026-02-28");
    expect(dayIn("2026-03-10", 31)).toBe("2026-03-31");
  });
  it("finds the closing on or before a date", () => {
    expect(closingOnOrBefore("2026-11-05", 5)).toBe("2026-11-05");
    expect(closingOnOrBefore("2026-11-04", 5)).toBe("2026-10-05");
    expect(closingOnOrBefore("2026-03-15", 31)).toBe("2026-02-28");
  });
  it("puts the due date after the closing", () => {
    expect(dueFor("2026-11-05", 25)).toBe("2026-11-25");
    expect(dueFor("2026-11-20", 10)).toBe("2026-12-10");
    expect(dueFor("2026-12-20", 5)).toBe("2027-01-05");
  });
});

describe("balances", () => {
  const charges = [
    { id: "a", date: "2026-10-10", amount: 200 },
    { id: "b", date: "2026-10-20", amount: -50 },
    { id: "e", date: "2026-10-01", amount: 600, emi: [1, 2, 3].map((n) => ({ due_date: `2026-${String(9 + n).padStart(2, "0")}-01`, amount: 200 })) },
  ];
  const payments = [{ id: "p", date: "2026-10-15", amount: 100 }];

  it("counts EMI purchases in full for the balance and by installment for billing", () => {
    expect(balanceAt(card(), charges, payments, "2026-10-31")).toBe(650);
    expect(billedAt(card(), charges, payments, "2026-10-31")).toBe(250);
    expect(billedAt(card(), charges, payments, "2026-12-31")).toBe(650);
  });

  it("ignores activity before tracking starts and adds the opening balance", () => {
    expect(balanceAt(card({ tracking_from: "2026-10-12", opening_balance: 300 }), charges, payments, "2026-10-31")).toBe(150);
  });
});

describe("summarizeCard", () => {
  it("reports statement, cycle and utilization", () => {
    const charges = [
      { id: "a", date: "2026-10-10", amount: 300 },
      { id: "b", date: "2026-11-08", amount: 100 },
    ];
    const s = summarizeCard(card(), charges, [{ id: "p", date: "2026-11-10", amount: 120 }], "2026-11-18");
    expect(s.outstanding).toBe(280);
    expect(s.available).toBe(720);
    expect(s.utilization).toBeCloseTo(0.28);
    expect(s.unbilled).toBe(100);
    expect(s.cycle).toEqual({ start: "2026-11-06", closing: "2026-12-05", due: "2026-12-25" });
    expect(s.statement).toMatchObject({ closing: "2026-11-05", due: "2026-11-25", amount: 300, paid: 120, remaining: 180, status: "due" });
  });

  it("flags an unpaid statement past its due date as overdue and a covered one as paid", () => {
    const charges = [{ id: "a", date: "2026-10-10", amount: 300 }];
    expect(summarizeCard(card(), charges, [], "2026-11-30").statement?.status).toBe("overdue");
    expect(summarizeCard(card(), charges, [{ id: "p", date: "2026-11-20", amount: 300 }], "2026-11-30").statement?.status).toBe("paid");
  });

  it("keeps the cycle open on the closing day", () => {
    const s = summarizeCard(card(), [], [], "2026-11-05");
    expect(s.cycle?.closing).toBe("2026-11-05");
  });

  it("has no utilization without a limit", () => {
    const s = summarizeCard(card({ credit_limit: null, statement_day: null }), [{ id: "a", date: "2026-11-01", amount: 10 }], [], "2026-11-18");
    expect(s.utilization).toBeNull();
    expect(s.statement).toBeNull();
    expect(s.outstanding).toBe(10);
  });
});

describe("utilization", () => {
  it("bands by the usual score thresholds", () => {
    expect(utilBand(0.05).label).toBe("Excellent");
    expect(utilBand(0.3).label).toBe("Good");
    expect(utilBand(0.45).tone).toBe("warn");
    expect(utilBand(0.8).tone).toBe("bad");
  });
  it("totals only cards with a limit", () => {
    const a = summarizeCard(card(), [{ id: "a", date: "2026-11-01", amount: 500 }], [], "2026-11-18");
    const b = summarizeCard(card({ id: "c2", credit_limit: null }), [{ id: "a", date: "2026-11-01", amount: 900 }], [], "2026-11-18");
    expect(overallUtilization([a, b])).toEqual({ outstanding: 500, limit: 1000, utilization: 0.5 });
  });
});

describe("recentlyUsed", () => {
  const c = (name: string, lastUsed: string | null) => ({ name, lastUsed });
  it("sorts newest first and keeps only n", () => {
    const r = recentlyUsed([c("a", "2026-01-01"), c("b", "2026-03-01"), c("c", "2026-02-01")], 2);
    expect(r.map((x) => x.name)).toEqual(["b", "c"]);
  });
  it("puts never-used cards last, by name", () => {
    const r = recentlyUsed([c("z", null), c("a", null), c("m", "2026-01-01")], 5);
    expect(r.map((x) => x.name)).toEqual(["m", "a", "z"]);
  });
});
