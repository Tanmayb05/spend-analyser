import { describe, expect, it } from "vitest";
import { isValidYearParam, monthForYear, monthsOfYear, yearEnd, yearStart } from "@/lib/dates";
import { foldOther, periodKpis, rowsInMonths, yearSeries } from "@/lib/analytics/period";
import { parseFilters } from "@/lib/analytics/filters";
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
