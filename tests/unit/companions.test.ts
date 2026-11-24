import { describe, expect, it } from "vitest";
import { companionStack, splitCompanions } from "@/lib/companions";

describe("splitCompanions", () => {
  it("splits on commas, and, ampersand and plus", () => {
    expect(splitCompanions("Ann, Ben and Cara")).toEqual(["Ann", "Ben", "Cara"]);
    expect(splitCompanions("Ann & Ben")).toEqual(["Ann", "Ben"]);
    expect(splitCompanions("Ann + Ben; Cara")).toEqual(["Ann", "Ben", "Cara"]);
    expect(splitCompanions("Ann, Ben, and Cara")).toEqual(["Ann", "Ben", "Cara"]);
  });
  it("does not split inside words", () => {
    expect(splitCompanions("Sandra Anderson")).toEqual(["Sandra Anderson"]);
    expect(splitCompanions("Andy")).toEqual(["Andy"]);
  });
  it("trims, drops empties and duplicates", () => {
    expect(splitCompanions("  Ann ,, ann ,  Ben  ")).toEqual(["Ann", "Ben"]);
    expect(splitCompanions("")).toEqual([]);
    expect(splitCompanions(null)).toEqual([]);
  });
});

describe("companionStack", () => {
  it("shows at most four and counts the rest", () => {
    const s = companionStack("A, B, C, D, E, F");
    expect(s.shown.map((p) => p.name)).toEqual(["A", "B", "C", "D"]);
    expect(s.extra).toBe(2);
  });
  it("builds initials and stable colours", () => {
    const a = companionStack("Tom Smith, ann");
    expect(a.shown[0].initials).toBe("TS");
    expect(a.shown[1].initials).toBe("A");
    expect(a.extra).toBe(0);
    expect(companionStack("Tom Smith").shown[0].color).toBe(a.shown[0].color);
    for (const p of a.shown) {
      expect(p.color).toBeGreaterThanOrEqual(1);
      expect(p.color).toBeLessThanOrEqual(8);
    }
  });
  it("is empty without companions", () => {
    expect(companionStack(null)).toEqual({ shown: [], extra: 0, all: [] });
  });
});
