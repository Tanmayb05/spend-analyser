import { describe, expect, it } from "vitest";
import { byCategory, countable, daysLeft, lastMonths, topWithOther, totalsFor, trailingAverage, monthlySeries, upcoming } from "@/lib/analytics/summary";
import { ruleInsights } from "@/lib/analytics/insights";
import { row } from "./fixtures";

const rows = [
  row({ entry_date: "2026-10-02", amount: 50 }),
  row({ entry_date: "2026-10-03", amount: 10, type: "refund" }),
  row({ entry_date: "2026-10-04", amount: 900, type: "income", category_id: "income", is_core: false }),
  row({ entry_date: "2026-10-04", amount: 600, category_id: "rent", is_core: false }),
  row({ entry_date: "2026-10-20", amount: 30, is_scheduled: true }),
  row({ entry_date: "2026-09-10", amount: 40 }),
];

describe("monthly totals", () => {
  it("spent = expense - refund, income separate, scheduled excluded in current month", () => {
    const t = totalsFor(rows, "2026-10-01", "2026-10-05");
    expect(t).toMatchObject({ spent: 640, income: 900, net: 260, core: 40 });
    expect(t.savingsRate).toBeCloseTo(260 / 900);
  });
  it("future month shows scheduled rows", () => {
    expect(countable(rows, "2026-10-01", "2026-09-15")).toHaveLength(rows.length);
  });
  it("category ranking + core scope", () => {
    expect(byCategory(rows, "2026-10-01", "2026-10-05").map((c) => c.categoryId)).toEqual(["rent", "groceries"]);
    expect(byCategory(rows, "2026-10-01", "2026-10-05", "core").map((c) => c.categoryId)).toEqual(["groceries"]);
  });
  it("top N + Other", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ categoryId: `c${i}`, spent: 100 - i, count: 1 }));
    const out = topWithOther(items, 5);
    expect(out).toHaveLength(6);
    expect(out[5]).toMatchObject({ categoryId: "other", spent: 95 + 94 + 93 });
  });
  it("window helpers", () => {
    expect(lastMonths("2026-10-01", 3)).toEqual(["2026-08-01", "2026-09-01", "2026-10-01"]);
    expect(daysLeft("2026-10-01", "2026-10-05")).toBe(27);
    expect(daysLeft("2026-09-01", "2026-10-05")).toBe(0);
    const series = monthlySeries(rows, lastMonths("2026-10-01", 4), "2026-10-05");
    expect(trailingAverage(series, "2026-10-01", 3, (s) => s.spent)).toBeCloseTo(40 / 3, 2);
    expect(upcoming(rows, "2026-10-05").map((r) => r.entry_date)).toEqual(["2026-10-20"]);
  });
  it("rule insights flag a category above its average", () => {
    const r = [
      ...["2026-07-05", "2026-08-05", "2026-09-05"].map((d) => row({ entry_date: d, amount: 100 })),
      row({ entry_date: "2026-10-02", amount: 200 }),
    ];
    const months = lastMonths("2026-10-01", 4);
    const out = ruleInsights({
      rows: r,
      series: monthlySeries(r, months, "2026-10-28"),
      month: "2026-10-01",
      today: "2026-10-28",
      budgets: new Map(),
      totals: { total: 0, core: 0, incomeTarget: 0 },
      categoryName: () => "Groceries",
      currency: "USD",
    });
    expect(out[0].text).toContain("Groceries is 2.0× your 3-month average");
  });
});

import { applyFilters, metric, parseFilters } from "@/lib/analytics/filters";

describe("transaction filters", () => {
  const id = "11111111-1111-1111-1111-111111111111";
  it("parses only valid params", () => {
    const f = parseFilters({ type: "income", cat: `${id},nope`, core: "1", q: " rent " });
    expect(f).toMatchObject({ type: "income", categories: [id], core: true, q: "rent" });
    expect(parseFilters({ type: "bogus" }).type).toBeNull();
  });
  it("filters core + category + text", () => {
    const f = parseFilters({ core: "1" });
    expect(applyFilters(rows, f).every((r) => r.is_core)).toBe(true);
    expect(applyFilters(rows, parseFilters({ cat: id }))).toHaveLength(0);
    expect(metric(applyFilters(rows, parseFilters({ type: "income" })), parseFilters({ type: "income" }))).toBe(900);
  });
});
