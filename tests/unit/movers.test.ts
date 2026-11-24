import { describe, expect, it } from "vitest";
import { barMax, deltaOf, isSteady, showsPercent, splitMovers, thanPhrase } from "@/lib/analytics/movers";
import { categoryMovers } from "@/lib/analytics/insight-views";
import { row } from "./fixtures";

const m = (categoryId: string, spent: number, base: number) => ({ categoryId, spent, base, change: base > 0 ? (spent - base) / base : null });

describe("splitMovers", () => {
  it("folds small or tiny-percent changes into steady and sorts movers by money moved", () => {
    const items = [m("rent", 1500, 1480), m("dining", 310, 100), m("coffee", 18, 12), m("travel", 40, 250), m("fun", 60, 0)];
    expect(isSteady(items[0])).toBe(true); // +20 but 1.3%
    expect(isSteady(items[2])).toBe(true); // +6
    const { moved, steady } = splitMovers(items);
    expect(moved.map((c) => c.categoryId)).toEqual(["dining", "travel", "fun"]);
    expect(steady.map((c) => c.categoryId)).toEqual(["rent", "coffee"]);
  });
  it("only shows a percent when the baseline is big enough", () => {
    expect(showsPercent(m("a", 25, 5))).toBe(false);
    expect(showsPercent(m("a", 250, 100))).toBe(true);
    expect(showsPercent(m("a", 50, 0))).toBe(false);
  });
});

describe("wording and scale", () => {
  it("shares one scale and never goes below 1", () => {
    expect(barMax([120, 340, 80])).toBe(340);
    expect(barMax([])).toBe(1);
  });
  it("words the comparison", () => {
    expect(thanPhrase("usual")).toBe("than usual");
    expect(thanPhrase("last month")).toBe("than last month");
    expect(thanPhrase("October 2025")).toBe("than in October 2025");
  });
  it("delta rounds to cents", () => {
    expect(deltaOf({ spent: 10.005, base: 0.001 })).toBeCloseTo(10, 1);
  });
});

describe("mover history", () => {
  it("lists the last six months, oldest first, this month last", () => {
    const rows = [row({ entry_date: "2026-07-05", amount: 100 }), row({ entry_date: "2026-09-05", amount: 40 }), row({ entry_date: "2026-10-05", amount: 200 })];
    const g = categoryMovers(rows, "2026-10-01", "2026-10-15", new Map()).find((c) => c.categoryId === "groceries")!;
    expect(g.history).toEqual([0, 0, 100, 0, 40, 200]);
  });
});
