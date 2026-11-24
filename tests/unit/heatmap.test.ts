import { describe, expect, it } from "vitest";
import { addDays, buildHeatGrid, dailySpend, heatLevel, heatThresholds, weekdayOf } from "@/lib/analytics/heatmap";
import { row } from "./fixtures";

describe("date helpers", () => {
  it("adds days across month, year and leap boundaries", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
  });
  it("gives the weekday (0 = Sunday)", () => {
    expect(weekdayOf("2026-11-24")).toBe(2);
    expect(weekdayOf("2026-11-22")).toBe(0);
  });
});

describe("dailySpend", () => {
  it("nets refunds and skips income, scheduled and out-of-range rows", () => {
    const m = dailySpend(
      [
        row({ entry_date: "2026-03-04", amount: 40 }),
        row({ entry_date: "2026-03-04", amount: 12 }),
        row({ entry_date: "2026-03-04", amount: 5, type: "refund" }),
        row({ entry_date: "2026-03-05", amount: 900, type: "income" }),
        row({ entry_date: "2026-03-06", amount: 70, is_scheduled: true }),
        row({ entry_date: "2025-01-01", amount: 70 }),
      ],
      "2026-01-01",
      "2026-12-31",
    );
    expect([...m]).toEqual([["2026-03-04", 47]]);
  });
});

describe("levels", () => {
  it("has no thresholds without spending and level 0 for empty days", () => {
    expect(heatThresholds([0, 0])).toEqual([]);
    expect(heatLevel(0, [])).toBe(0);
    expect(heatLevel(-3, [])).toBe(0);
  });
  it("splits spending days into four steps by size", () => {
    const t = heatThresholds([10, 20, 30, 40, 50, 60, 70, 80]);
    expect(t).toHaveLength(3);
    const levels = [10, 30, 50, 80].map((a) => heatLevel(a, t));
    expect(levels[0]).toBe(1);
    expect(levels[3]).toBe(4);
    expect(levels).toEqual([...levels].sort());
  });
  it("puts every day at level 1 when all amounts match", () => {
    expect(heatLevel(25, heatThresholds([25, 25, 25]))).toBe(1);
  });
});

describe("buildHeatGrid", () => {
  const end = "2026-11-24"; // a Tuesday
  it("builds 53 columns of 7 rows, Monday first, ending on `end`", () => {
    const g = buildHeatGrid(new Map([["2026-11-24", 52]]), end, 1);
    expect(g.weeks).toHaveLength(53);
    expect(g.weeks.every((w) => w.length === 7)).toBe(true);
    expect(g.rowDays).toEqual([1, 2, 3, 4, 5, 6, 0]);
    const last = g.weeks.at(-1)!;
    expect(last[1]?.date).toBe(end); // Tuesday = second row
    expect(last.slice(2).every((c) => c === null)).toBe(true); // nothing after today
    expect(g.weeks[0][0]?.date).toBe("2025-11-24");
    expect(g.total).toBe(52);
    expect(g.activeDays).toBe(1);
    expect(last[1]?.level).toBe(1);
  });
  it("starts the week on Sunday when asked", () => {
    const g = buildHeatGrid(new Map(), end, 0);
    expect(g.rowDays[0]).toBe(0);
    expect(g.weeks.at(-1)![2]?.date).toBe(end);
    expect(weekdayOf(g.weeks[0][0]!.date)).toBe(0);
  });
  it("labels each month once, spaced apart", () => {
    const g = buildHeatGrid(new Map(), end, 1);
    const keys = g.months.map((m) => `${m.label}${m.year}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(g.months.map((m) => m.label)).toContain("Jan");
    for (let i = 1; i < g.months.length; i++) expect(g.months[i].col - g.months[i - 1].col).toBeGreaterThanOrEqual(3);
  });
  it("copes with a year with no data", () => {
    const g = buildHeatGrid(new Map(), end, 1);
    expect(g.total).toBe(0);
    expect(g.activeDays).toBe(0);
    expect(g.weeks.flat().every((c) => c === null || c.level === 0)).toBe(true);
  });
  it("ignores spending outside the window", () => {
    const g = buildHeatGrid(new Map([["2020-01-01", 999], ["2026-12-30", 999]]), end, 1);
    expect(g.total).toBe(0);
  });
});
