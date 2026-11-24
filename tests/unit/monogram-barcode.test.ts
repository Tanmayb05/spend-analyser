import { describe, expect, it } from "vitest";
import { monogram } from "@/lib/monogram";
import { barcodeBars } from "@/lib/barcode";

describe("monogram", () => {
  it("uses the first letters of the first two words", () => {
    expect(monogram("Whole Foods Market")).toBe("WF");
    expect(monogram("uber")).toBe("U");
    expect(monogram("7-Eleven")).toBe("7E");
  });
  it("skips leading symbols and handles empty names", () => {
    expect(monogram("  (Costco)")).toBe("C");
    expect(monogram("")).toBe("·");
    expect(monogram(null)).toBe("·");
    expect(monogram("***")).toBe("·");
  });
});

describe("barcodeBars", () => {
  it("is deterministic per seed and differs between seeds", () => {
    expect(barcodeBars("abc")).toEqual(barcodeBars("abc"));
    expect(barcodeBars("abc")).not.toEqual(barcodeBars("abd"));
  });
  it("lays bars out left to right with no overlap", () => {
    const b = barcodeBars("seed", 20);
    expect(b).toHaveLength(20);
    for (let i = 1; i < b.length; i++) expect(b[i].x).toBeGreaterThan(b[i - 1].x + b[i - 1].w - 1);
    expect(b.every((x) => x.w >= 1 && x.w <= 3)).toBe(true);
  });
});
