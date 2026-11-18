import { describe, expect, it } from "vitest";
import { costUsd, priceFor, PRICES } from "@/lib/ai/pricing";
import { DEFAULT_MODELS } from "@/lib/ai/config";

const u = (input: number | null, output: number | null, cacheRead: number | null = null, cacheWrite: number | null = null) => ({ input, output, cacheRead, cacheWrite, reasoning: null });

describe("pricing", () => {
  it("has a price for every default model", () => {
    for (const tiers of Object.values(DEFAULT_MODELS)) for (const m of Object.values(tiers)) expect(priceFor(m), m).not.toBeNull();
  });

  it("prices input and output per million tokens", () => {
    // Haiku 5.5: $0.10 in, $0.50 out
    expect(costUsd("claude-haiku-5-5", u(100_000, 100_000))).toBeCloseTo(0.06, 6);
    expect(costUsd("claude-haiku-5-5", u(6000, 400))).toBeCloseTo(0.0008, 6);
  });

  it("bills cached reads and writes at their own rates", () => {
    // 1M input of which 600k cache read and 100k cache write, no output
    const c = costUsd("claude-sonnet-5-5", u(1_000_000, 0, 600_000, 100_000))!;
    expect(c).toBeCloseTo(0.3 * 2 + 0.6 * 0.1 + 0.1 * 2.5, 6);
  });

  it("switches to long-context rates above the threshold", () => {
    expect(costUsd("claude-haiku-5-5", u(200_000, 0))).toBeCloseTo(0.1, 6); // 200k × $0.50
    expect(costUsd("gemini-2.5-pro", u(100_000, 0))).toBeCloseTo(0.125, 6);
  });

  it("matches versioned model ids by prefix and returns null for unknown models", () => {
    expect(priceFor("gemini-2.5-flash-001")).toBe(PRICES["gemini-2.5-flash"]);
    expect(priceFor("gemini-2.5-flash-lite")).toBe(PRICES["gemini-2.5-flash"]);
    expect(costUsd("some-new-model", u(10, 10))).toBeNull();
    expect(costUsd(null, u(10, 10))).toBeNull();
  });

  it("returns null when there are no token counts, and 0 for the mock", () => {
    expect(costUsd("claude-haiku-5-5", u(null, null))).toBeNull();
    expect(costUsd("mock-fast", u(500, 500))).toBe(0);
  });
});
