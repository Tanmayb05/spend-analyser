import { describe, expect, it } from "vitest";
import { categoryMovers, compareLabel, compareTotals, cumulativeSpend, forecastMonth, merchantRows, parseCompareBase, recurringCharges, spendingRhythm } from "@/lib/analytics/insight-views";
import { row } from "./fixtures";

const TODAY = "2026-10-15";
const rows = [
  // groceries: usual 100/month, 200 this month
  row({ entry_date: "2026-07-05", amount: 100 }),
  row({ entry_date: "2026-08-05", amount: 100 }),
  row({ entry_date: "2026-09-05", amount: 100 }),
  row({ entry_date: "2026-10-05", amount: 200 }),
  // a brand-new category this month
  row({ entry_date: "2026-10-06", amount: 50, category_id: "fun", merchant_id: "m-new", merchant_name: "Arcade" }),
  // streaming: same charge 4 months running
  ...["2026-07-02", "2026-08-02", "2026-09-02", "2026-10-02"].map((d) => row({ entry_date: d, amount: 15, category_id: "subs", merchant_id: "m-stream", merchant_name: "Streamly" })),
  // gym: varies too much to be a subscription
  ...["2026-08-03", "2026-09-03", "2026-10-03"].map((d, i) => row({ entry_date: d, amount: [20, 60, 25][i], category_id: "health", merchant_id: "m-gym", merchant_name: "Gym" })),
];

describe("categoryMovers", () => {
  it("compares this month to the 3-month average and flags budgets", () => {
    const budgets = new Map([["groceries", { categoryId: "groceries", amount: 150, since: null }]]);
    const out = categoryMovers(rows, "2026-10-01", TODAY, budgets);
    const g = out.find((c) => c.categoryId === "groceries")!;
    expect(g).toMatchObject({ spent: 200, status: "over", budget: 150 });
    expect(g.base).toBeCloseTo(100);
    expect(g.change).toBeCloseTo(1);
    expect(out.find((c) => c.categoryId === "fun")).toMatchObject({ change: null, status: "none" });
    expect(out[0].categoryId).toBe("groceries");
  });
});

describe("period compare", () => {
  const groc = row({ entry_date: "2025-10-05", amount: 80 });
  const all = [...rows, groc, row({ entry_date: "2026-10-04", amount: 1000, type: "income", category_id: "income", is_core: false })];
  it("baseline can be last month or last year", () => {
    const prev = categoryMovers(all, "2026-10-01", TODAY, new Map(), "prev").find((c) => c.categoryId === "groceries")!;
    expect(prev).toMatchObject({ spent: 200, base: 100 });
    expect(prev.change).toBeCloseTo(1);
    const year = categoryMovers(all, "2026-10-01", TODAY, new Map(), "year").find((c) => c.categoryId === "groceries")!;
    expect(year).toMatchObject({ spent: 200, base: 80 });
    expect(year.change).toBeCloseTo(1.5);
  });
  it("totals against the baseline", () => {
    const t = compareTotals(all, "2026-10-01", TODAY, "prev");
    expect(t.spent).toMatchObject({ now: 200 + 50 + 15 + 25, base: 100 + 15 + 60 });
    expect(t.income).toMatchObject({ now: 1000, base: 0, change: null });
    // no spending a year ago in these rows except groceries 80
    expect(compareTotals(all, "2026-10-01", TODAY, "year").spent.base).toBe(80);
  });
  it("labels and parsing", () => {
    expect(compareLabel("2026-10-01", "avg")).toBe("usual");
    expect(compareLabel("2026-10-01", "prev")).toBe("last month");
    expect(compareLabel("2026-10-01", "year")).toBe("October 2025");
    expect(parseCompareBase("year")).toBe("year");
    expect(parseCompareBase("junk")).toBe("avg");
  });
});

describe("merchantRows", () => {
  it("marks merchants not seen in the prior 3 months as new", () => {
    const out = merchantRows(rows, "2026-10-01", TODAY);
    expect(out.find((m) => m.name === "Arcade")?.isNew).toBe(true);
    expect(out.find((m) => m.name === "Streamly")).toMatchObject({ isNew: false, spent: 15 });
    expect(out.find((m) => m.name === "Streamly")!.avg).toBeCloseTo(15);
  });
});

describe("recurringCharges", () => {
  it("finds steady monthly charges and skips erratic ones", () => {
    const out = recurringCharges(rows, "2026-10-01", TODAY);
    expect(out.map((r) => r.name)).toEqual(["Streamly"]);
    expect(out[0]).toMatchObject({ typical: 15, months: 4, lastDate: "2026-10-02" });
  });
  it("ignores plan installments", () => {
    const plan = ["2026-08-01", "2026-09-01", "2026-10-01"].map((d) => row({ entry_date: d, amount: 80, merchant_id: "m-emi", merchant_name: "Phone", plan_kind: "emi" }));
    expect(recurringCharges(plan, "2026-10-01", TODAY)).toEqual([]);
  });
});

describe("spendingRhythm", () => {
  it("counts days with nothing spent and sizes a typical purchase", () => {
    const r = spendingRhythm(rows, "2026-10-01", TODAY);
    // Oct 2, 3, 5, 6 have spending; 15 days elapsed
    expect(r.daysElapsed).toBe(15);
    expect(r.noSpendDays).toBe(11);
    expect(r.count).toBe(4);
    expect(r.biggest).toMatchObject({ amount: 200, date: "2026-10-05" });
    expect(r.avgTxn).toBeCloseTo((200 + 50 + 15 + 25) / 4, 2);
    expect(r.weekdays).toHaveLength(7);
    expect(r.busiest).not.toBeNull();
  });
  it("a future month has no elapsed days", () => {
    expect(spendingRhythm(rows, "2026-12-01", TODAY)).toMatchObject({ daysElapsed: 0, noSpendDays: 0, perDay: 0 });
  });
});

describe("forecast", () => {
  it("is only for the current month", () => {
    expect(forecastMonth(rows, "2026-09-01", TODAY, 1000)).toBeNull();
    expect(forecastMonth(rows, "2026-11-01", TODAY, 1000)).toBeNull();
  });
  it("adds booked entries and everyday pace to what is posted", () => {
    const f = forecastMonth(
      [
        row({ entry_date: "2026-10-02", amount: 150 }), // core, posted
        row({ entry_date: "2026-10-03", amount: 600, category_id: "rent", is_core: false }), // not extrapolated
        row({ entry_date: "2026-10-05", amount: 80, plan_kind: "emi", is_core: true }), // posted plan: counted, not paced
        row({ entry_date: "2026-10-20", amount: 80, plan_kind: "emi", is_scheduled: true }), // booked
        row({ entry_date: "2026-10-04", amount: 5000, type: "income", category_id: "income", is_core: false }),
      ],
      "2026-10-01",
      TODAY,
      1500,
    )!;
    expect(f).toMatchObject({ day: 15, days: 31, posted: 830, scheduledLeft: 80, pace: 10, daysLeft: 16, early: false });
    expect(f.projected).toBe(830 + 80 + 10 * 16);
    expect(f.safePerDay).toBeCloseTo((1500 - 830 - 80) / 16, 1);
    expect(f.status).toBe("ok"); // 1070 / 1500 = 71%
  });
  it("flags the first days as too early, and a missing budget", () => {
    const f = forecastMonth([row({ entry_date: "2026-10-01", amount: 50 })], "2026-10-01", "2026-10-02", 0)!;
    expect(f).toMatchObject({ early: true, safePerDay: null, status: "none" });
  });
  it("running total by day", () => {
    const r = [row({ entry_date: "2026-10-02", amount: 10 }), row({ entry_date: "2026-10-02", amount: 5 }), row({ entry_date: "2026-10-04", amount: 20 }), row({ entry_date: "2026-10-09", amount: 99 })];
    expect(cumulativeSpend(r, "2026-10-01", 4)).toEqual([0, 15, 15, 35]);
  });
});
