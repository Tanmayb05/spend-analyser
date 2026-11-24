import { describe, expect, it } from "vitest";
import { expectedAt, flightPath, gapPhrase, paceNote, toneFor } from "@/lib/analytics/flight-path";

const money = (n: number) => `$${Math.round(n)}`;
const base = { day: 10, days: 30, cumulative: Array.from({ length: 10 }, (_, i) => (i + 1) * 10), budget: 600, lastMonthTotal: 450, projected: 580, early: false };

describe("expectedAt", () => {
  it("is a straight line from zero to the target", () => {
    expect(expectedAt(600, 15, 30)).toBe(300);
    expect(expectedAt(600, 30, 30)).toBe(600);
    expect(expectedAt(0, 10, 30)).toBe(0);
    expect(expectedAt(600, 99, 30)).toBe(600);
  });
});

describe("flightPath", () => {
  it("measures against the budget when there is one", () => {
    const p = flightPath(base);
    expect(p.basis).toBe("budget");
    expect(p.expectedToday).toBe(200);
    expect(p.actual).toBe(100);
    expect(p.gap).toBe(-100);
    expect(p.tone).toBe("good");
    expect(gapPhrase(p.gap, money)).toBe("$100 under pace");
  });
  it("falls back to last month's total, then to nothing", () => {
    const p = flightPath({ ...base, budget: 0 });
    expect(p.basis).toBe("last-month");
    expect(p.target).toBe(450);
    expect(paceNote(p.basis!, p.target, money)).toBe("Even pace to last month's $450");
    const none = flightPath({ ...base, budget: 0, lastMonthTotal: 0 });
    expect(none.basis).toBeNull();
    expect(none.gap).toBe(0);
    expect(none.tone).toBe("neutral");
  });
  it("is over pace and warns small, flags big", () => {
    const small = flightPath({ ...base, cumulative: [...base.cumulative.slice(0, 9), 230] });
    expect(small.gap).toBe(30);
    expect(small.tone).toBe("warn");
    expect(gapPhrase(small.gap, money)).toBe("$30 over pace");
    const big = flightPath({ ...base, cumulative: [...base.cumulative.slice(0, 9), 400] });
    expect(big.tone).toBe("bad");
  });
  it("handles day 1, the last day and an empty month", () => {
    const d1 = flightPath({ ...base, day: 1, cumulative: [0], early: true });
    expect(d1.actual).toBe(0);
    expect(d1.showProjection).toBe(false);
    expect(d1.gap).toBe(-20);
    const last = flightPath({ ...base, day: 30, cumulative: Array.from({ length: 30 }, () => 600) });
    expect(last.showProjection).toBe(false);
    expect(last.gap).toBe(0);
    expect(gapPhrase(last.gap, money)).toBe("On pace");
    const empty = flightPath({ ...base, cumulative: Array(10).fill(0), projected: 0 });
    expect(empty.top).toBeGreaterThan(0);
  });
  it("leaves headroom above the highest point", () => {
    const p = flightPath({ ...base, projected: 900 });
    expect(p.top).toBeCloseTo(972);
  });
});

describe("toneFor", () => {
  it("treats a rounding-sized gap as neutral", () => {
    expect(toneFor(0.2, 600)).toBe("neutral");
    expect(toneFor(-5, 600)).toBe("good");
    expect(toneFor(61, 600)).toBe("bad");
  });
});
