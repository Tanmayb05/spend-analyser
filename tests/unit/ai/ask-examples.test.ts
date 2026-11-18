import { describe, expect, it } from "vitest";
import { ASK_EXAMPLES, pickAskExamples } from "@/lib/ai/ask-examples";

describe("ask examples", () => {
  it("has 30 distinct questions", () => {
    expect(ASK_EXAMPLES).toHaveLength(30);
    expect(new Set(ASK_EXAMPLES).size).toBe(30);
  });

  it("picks 5 distinct questions from the list", () => {
    const picked = pickAskExamples(5);
    expect(picked).toHaveLength(5);
    expect(new Set(picked).size).toBe(5);
    for (const q of picked) expect(ASK_EXAMPLES).toContain(q);
  });

  it("shuffles: different random draws give different picks, and every question can appear", () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const seen = new Set<string>();
    const draws = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = pickAskExamples(5, rand);
      p.forEach((q) => seen.add(q));
      draws.add(p.join("|"));
    }
    expect(seen.size).toBe(30);
    expect(draws.size).toBeGreaterThan(150);
  });

  it("does not change the source list", () => {
    const before = [...ASK_EXAMPLES];
    pickAskExamples(5, () => 0);
    expect([...ASK_EXAMPLES]).toEqual(before);
  });
});
