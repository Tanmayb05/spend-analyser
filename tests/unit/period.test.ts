import { describe, expect, it } from "vitest";
import { isValidYearParam, monthForYear, monthsOfYear, yearEnd, yearStart } from "@/lib/dates";
import { foldOther, periodKpis, postedRows, rowsInMonths, yearSeries } from "@/lib/analytics/period";
import { groupRows } from "@/components/transactions/txn-list";
import { amountQuery, applyFilters, parseFilters, parseSort } from "@/lib/analytics/filters";
import type { LedgerRow } from "@/lib/data/types";

const r = (month: string, spend: number, income = 0): LedgerRow => ({ month, spend, income }) as unknown as LedgerRow;
const none = parseFilters({});

describe("year dates", () => {
  it("validates year params", () => {
    expect(isValidYearParam("2026")).toBe(true);
    expect(isValidYearParam("26")).toBe(false);
    expect(isValidYearParam("abcd")).toBe(false);
    expect(isValidYearParam(undefined)).toBe(false);
  });
  it("lists Jan..Dec month starts and year bounds", () => {
    const m = monthsOfYear(2026);
    expect(m).toHaveLength(12);
    expect(m[0]).toBe("2026-01-01");
    expect(m[11]).toBe("2026-12-01");
    expect(yearStart(2026)).toBe("2026-01-01");
    expect(yearEnd(2026)).toBe("2026-12-31");
  });
  it("picks the month to land on when leaving Year view", () => {
    expect(monthForYear(2026, "2026-04-01", "2026-11-14")).toBe("2026-04-01");
    expect(monthForYear(2026, "2025-04-01", "2026-11-14")).toBe("2026-11-01");
    expect(monthForYear(2024, "2026-04-01", "2026-11-14")).toBe("2024-12-01");
  });
});

describe("yearSeries", () => {
  const rows = [r("2026-01-01", 100), r("2026-01-01", 50), r("2026-03-01", 20), r("2025-12-01", 999), r("2026-12-01", 70)];
  it("returns 12 ordered points, ignoring other years, and flags future months", () => {
    const s = yearSeries(rows, 2026, none, "2026-11-14");
    expect(s.map((p) => p.month)).toEqual(monthsOfYear(2026));
    expect(s[0].a).toBe(150);
    expect(s[1].a).toBe(0);
    expect(s[2].a).toBe(20);
    expect(s[10].future).toBe(false); // November = current month
    expect(s[11].future).toBe(true);
    expect(s[11].a).toBe(70);
  });
  it("tracks income when the type filter is income", () => {
    const s = yearSeries([r("2026-02-01", 10, 500)], 2026, parseFilters({ type: "income" }), "2026-11-14");
    expect(s[1].a).toBe(500);
  });
});

describe("periodKpis", () => {
  it("computes saved and savings rate", () => {
    expect(periodKpis([r("2026-01-01", 300, 1000), r("2026-02-01", 200, 0)])).toEqual({ spend: 500, income: 1000, saved: 500, savingsRate: 0.5 });
  });
  it("reports a loss as negative and null rate without income", () => {
    expect(periodKpis([r("2026-01-01", 300, 0)])).toEqual({ spend: 300, income: 0, saved: -300, savingsRate: null });
    expect(periodKpis([r("2026-01-01", 300, 100)]).saved).toBe(-200);
  });
  it("filters rows by month range", () => {
    expect(rowsInMonths([r("2026-01-01", 1), r("2026-02-01", 2), r("2026-03-01", 3)], "2026-02-01", "2026-03-01")).toHaveLength(2);
  });
});

describe("foldOther", () => {
  it("returns everything when it fits", () => {
    const items = [{ key: "a", value: 3 }, { key: "b", value: 5 }];
    expect(foldOther(items, 6).map((i) => i.key)).toEqual(["b", "a"]);
  });
  it("folds the tail into other and keeps the total", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ key: `k${i}`, value: 10 - i }));
    const out = foldOther(items, 6);
    expect(out).toHaveLength(7);
    expect(out[6]).toEqual({ key: "other", value: 4 + 3 + 2 + 1 });
    expect(out.reduce((a, x) => a + x.value, 0)).toBe(55);
  });
});

describe("scheduled rows and amount search", () => {
  const sched = (month: string, spend: number) => ({ month, spend, income: 0, is_scheduled: true }) as unknown as LedgerRow;
  const posted = (month: string, spend: number) => ({ month, spend, income: 0, is_scheduled: false }) as unknown as LedgerRow;

  it("postedRows drops scheduled rows except in months that haven't started", () => {
    const rows = [posted("2026-11-01", 10), sched("2026-11-01", 20), sched("2026-12-01", 30)];
    const out = postedRows(rows, "2026-11-15");
    expect(out.map((x) => x.spend)).toEqual([10, 30]);
    expect(periodKpis(out).spend).toBe(40);
  });

  it("amountQuery recognises plain amounts only", () => {
    expect(amountQuery("42")).toBe("42");
    expect(amountQuery("$1,250.5")).toBe("1250.5");
    expect(amountQuery("netflix")).toBeNull();
    expect(amountQuery("")).toBeNull();
  });

  it("applyFilters matches by amount, merchant and extra text", () => {
    const rows = [
      { month: "2026-11-01", amount: 42.5, merchant_name: "Kroger", description: null } as unknown as LedgerRow,
      { month: "2026-11-01", amount: 9.99, merchant_name: "Netflix", description: null } as unknown as LedgerRow,
    ];
    const f = (q: string) => applyFilters(rows, { ...none, q }, () => "").map((x) => x.merchant_name);
    expect(f("$42")).toEqual(["Kroger"]);
    expect(f("9.99")).toEqual(["Netflix"]);
    expect(f("netf")).toEqual(["Netflix"]);
  });

  it("parseSort defaults to newest", () => {
    expect(parseSort({})).toBe("newest");
    expect(parseSort({ sort: "largest" })).toBe("largest");
    expect(parseSort({ sort: "x" })).toBe("newest");
  });

  it("groupRows orders days and flattens for largest", () => {
    const mk = (d: string, a: number) => ({ entry_date: d, amount: a, spend: a, income: 0 }) as unknown as LedgerRow;
    const rows = [mk("2026-11-01", 5), mk("2026-11-03", 50), mk("2026-11-03", 7)];
    expect(groupRows(rows, "newest").map((g) => g.key)).toEqual(["2026-11-03", "2026-11-01"]);
    expect(groupRows(rows, "oldest").map((g) => g.key)).toEqual(["2026-11-01", "2026-11-03"]);
    const big = groupRows(rows, "largest");
    expect(big).toHaveLength(1);
    expect(big[0].rows.map((x) => x.amount)).toEqual([50, 7, 5]);
  });
});
