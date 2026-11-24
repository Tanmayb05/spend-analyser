import { describe, expect, it } from "vitest";
import { fitFontSize, hashString, isTripEnded, shortenLabel, stampColorIndex, stampDate, stampRotation } from "@/lib/trip-stamp";

describe("trip stamp helpers", () => {
  it("treats a trip as ended only when its end date is before today", () => {
    expect(isTripEnded("2026-03-01", "2026-11-24")).toBe(true);
    expect(isTripEnded("2026-11-24", "2026-11-24")).toBe(false);
    expect(isTripEnded("2027-01-01", "2026-11-24")).toBe(false);
    expect(isTripEnded(null, "2026-11-24")).toBe(false);
    expect(isTripEnded(undefined, "2026-11-24")).toBe(false);
  });
  it("hashes deterministically", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).not.toBe(hashString("abd"));
  });
  it("keeps rotation within -4..4 and stable per id", () => {
    for (let i = 0; i < 200; i++) {
      const r = stampRotation(`trip-${i}`);
      expect(r).toBeGreaterThanOrEqual(-4);
      expect(r).toBeLessThanOrEqual(4);
      expect(r).toBe(stampRotation(`trip-${i}`));
    }
  });
  it("picks a chart token 1..8 and uses several of them", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const c = stampColorIndex(`id-${i}`);
      expect(c).toBeGreaterThanOrEqual(1);
      expect(c).toBeLessThanOrEqual(8);
      seen.add(c);
    }
    expect(seen.size).toBeGreaterThan(4);
  });
  it("shortens long names at a word boundary", () => {
    expect(shortenLabel("Lisbon")).toBe("Lisbon");
    expect(shortenLabel("  Lisbon   and  Porto ")).toBe("Lisbon and Porto");
    expect(shortenLabel("Summer road trip across Portugal", 18)).toBe("Summer road trip…");
    expect(shortenLabel("Supercalifragilisticexpialidocious", 12)).toBe("Supercalifr…");
    expect(shortenLabel("Supercalifragilisticexpialidocious", 12).length).toBeLessThanOrEqual(12);
  });
  it("formats the stamp date as month and year", () => {
    expect(stampDate("2026-03-14")).toBe("Mar 2026");
  });
  it("shrinks the centre figure for long text", () => {
    expect(fitFontSize("$1,200")).toBeCloseTo(22);
    expect(fitFontSize("$1,234,567,890")).toBeLessThan(fitFontSize("$1,200"));
    expect(fitFontSize("x".repeat(100))).toBe(10);
  });
});
