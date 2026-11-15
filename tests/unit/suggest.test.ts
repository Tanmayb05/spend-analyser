import { describe, expect, it } from "vitest";
import { buildSuggestIndex, suggest } from "@/lib/analytics/suggest";

const merchants = [
  { id: "m1", name: "Kroger" },
  { id: "m2", name: "Trader Joe's" },
  { id: "m3", name: "Whole Foods" },
  { id: "m4", name: "The Kroger Fuel" },
];
const descriptions = ["Weekly groceries", "kroger", "Joe's coffee run", "Groceries for party", "  ", "Weekly groceries"];

describe("suggest", () => {
  const index = buildSuggestIndex(merchants, descriptions);

  it("returns nothing for blank query", () => {
    expect(suggest(index, "")).toEqual([]);
    expect(suggest(index, "   ")).toEqual([]);
  });

  it("matches case-insensitively and ranks prefix before word-start before substring", () => {
    const out = suggest(index, "KRO").filter((s) => s.kind === "merchant");
    expect(out.map((s) => s.text)).toEqual(["Kroger", "The Kroger Fuel"]);
  });

  it("lists merchants before descriptions and carries merchant ids", () => {
    const out = suggest(index, "joe");
    expect(out[0]).toEqual({ kind: "merchant", id: "m2", text: "Trader Joe's" });
    expect(out.some((s) => s.kind === "description" && s.text === "Joe's coffee run")).toBe(true);
    expect(out.findIndex((s) => s.kind === "description")).toBeGreaterThan(0);
  });

  it("dedupes descriptions, blanks, and descriptions equal to a merchant name", () => {
    const out = suggest(index, "weekly");
    expect(out).toEqual([{ kind: "description", text: "Weekly groceries" }]);
    expect(suggest(index, "kroger").filter((s) => s.kind === "description")).toEqual([]);
  });

  it("respects the limit", () => {
    const many = buildSuggestIndex(
      Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, name: `Shop ${i}` })),
      Array.from({ length: 20 }, (_, i) => `shop note ${i}`),
    );
    const out = suggest(many, "shop", 8);
    expect(out).toHaveLength(8);
    expect(out.some((s) => s.kind === "description")).toBe(true);
  });
});
