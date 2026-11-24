import { describe, expect, it } from "vitest";
import { directionOf, FLAT_THRESHOLD, shapePriceTag, SPARK_MAX, sparkPath, sparkPoints, sortPoints } from "@/lib/analytics/price-tag";

describe("shapePriceTag", () => {
  it("returns null with no purchases", () => {
    expect(shapePriceTag([])).toBeNull();
  });
  it("one purchase has a price but nothing to compare", () => {
    const t = shapePriceTag([{ date: "2026-05-01", price: 4.5, merchant: "Aldi" }])!;
    expect(t.current).toBe(4.5);
    expect(t.previous).toBeNull();
    expect(t.change).toBeNull();
    expect(t.direction).toBeNull();
    expect(t.lastMerchant).toBe("Aldi");
    expect(t.count).toBe(1);
  });
  it("compares the latest to the previous purchase, whatever the input order", () => {
    const t = shapePriceTag([
      { date: "2026-06-01", price: 5, merchant: "Costco" },
      { date: "2026-04-01", price: 4 },
      { date: "2026-05-01", price: 4.5 },
    ])!;
    expect(t.current).toBe(5);
    expect(t.previous).toBe(4.5);
    expect(t.change).toBeCloseTo(0.5 / 4.5, 6);
    expect(t.direction).toBe("up");
    expect(t.history).toEqual([4, 4.5, 5]);
    expect(t.lastDate).toBe("2026-06-01");
    expect(t.lastMerchant).toBe("Costco");
  });
  it("down when the price fell", () => {
    const t = shapePriceTag([{ date: "2026-01-01", price: 10 }, { date: "2026-02-01", price: 8 }])!;
    expect(t.direction).toBe("down");
    expect(t.change).toBeCloseTo(-0.2, 6);
  });
  it("treats a move under the threshold as flat", () => {
    const t = shapePriceTag([{ date: "2026-01-01", price: 100 }, { date: "2026-02-01", price: 100.5 }])!;
    expect(t.direction).toBe("flat");
    expect(directionOf(FLAT_THRESHOLD)).toBe("up");
    expect(directionOf(-FLAT_THRESHOLD)).toBe("down");
    expect(directionOf(FLAT_THRESHOLD - 0.001)).toBe("flat");
  });
  it("has no change when the previous price is zero", () => {
    const t = shapePriceTag([{ date: "2026-01-01", price: 0 }, { date: "2026-02-01", price: 3 }])!;
    expect(t.change).toBeNull();
    expect(t.direction).toBeNull();
  });
  it("caps the history to the latest purchases", () => {
    const pts = Array.from({ length: SPARK_MAX + 5 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, price: i + 1 }));
    const t = shapePriceTag(pts)!;
    expect(t.history).toHaveLength(SPARK_MAX);
    expect(t.history.at(-1)).toBe(SPARK_MAX + 5);
    expect(t.count).toBe(SPARK_MAX + 5);
  });
  it("sorts undated purchases first and keeps ties stable", () => {
    const s = sortPoints([{ date: "2026-02-01", price: 2 }, { date: null, price: 1 }, { date: "2026-02-01", price: 3 }]);
    expect(s.map((p) => p.price)).toEqual([1, 2, 3]);
  });
});

describe("sparkPoints", () => {
  it("needs two prices", () => {
    expect(sparkPoints([], 60, 20)).toEqual([]);
    expect(sparkPoints([3], 60, 20)).toEqual([]);
  });
  it("spans the box with the highest price at the top", () => {
    const p = sparkPoints([1, 3, 2], 60, 20, 2);
    expect(p[0].x).toBe(2);
    expect(p[2].x).toBe(58);
    expect(p[1].y).toBe(2);
    expect(p[0].y).toBe(18);
  });
  it("draws a flat series mid-height", () => {
    expect(sparkPoints([5, 5, 5], 60, 20).every((p) => p.y === 10)).toBe(true);
  });
  it("builds an SVG path", () => {
    expect(sparkPath([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toBe("M1,2 L3,4");
  });
});
