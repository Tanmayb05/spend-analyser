import { describe, expect, it } from "vitest";
import { bucket, byDay, percentile, summariseCalls, type CallRow } from "@/lib/ai/call-stats";

let id = 0;
const row = (p: Partial<CallRow>): CallRow => ({
  id: ++id,
  feature: "parse_text",
  provider: "claude",
  model: "claude-haiku-5-5",
  status: "ok",
  error_code: null,
  latency_ms: 1000,
  tokens_in: 100,
  tokens_out: 10,
  cache_read_tokens: null,
  reasoning_tokens: null,
  tool_calls: 0,
  cost_usd: 0.001,
  created_at: "2026-11-10T12:00:00Z",
  ...p,
});

describe("call stats", () => {
  it("percentile uses nearest rank", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([5], 95)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
  });

  it("totals calls, tokens, cost and success, ignoring blocked calls for success and latency", () => {
    const b = bucket("all", [
      row({ latency_ms: 800 }),
      row({ latency_ms: 1200, cost_usd: 0.002 }),
      row({ status: "error", error_code: "upstream", latency_ms: 5000, tokens_in: null, tokens_out: null, cost_usd: null }),
      row({ status: "blocked", error_code: "quota", latency_ms: null, tokens_in: null, tokens_out: null, cost_usd: null }),
    ]);
    expect(b).toMatchObject({ calls: 4, ok: 2, errors: 1, blocked: 1, successPct: 66.7, tokensIn: 200, tokensOut: 20, costUsd: 0.003, unpriced: 0, p50Ms: 1200, p95Ms: 5000 });
  });

  it("counts priced-model gaps as unpriced", () => {
    expect(bucket("x", [row({ model: "new-model", cost_usd: null })]).unpriced).toBe(1);
  });

  it("groups by feature and model, and lists failures", () => {
    const s = summariseCalls(
      [row({}), row({ feature: "chat", model: "claude-sonnet-5-5" }), row({ feature: "chat", status: "blocked", error_code: "quota" })],
      new Date("2026-11-09T00:00:00Z"),
      new Date("2026-11-11T08:00:00Z"),
    );
    expect(s.byFeature.map((b) => [b.key, b.calls])).toEqual([["chat", 2], ["parse_text", 1]]);
    expect(s.byModel.map((b) => b.key)).toEqual(["claude · claude-haiku-5-5", "claude · claude-sonnet-5-5"]);
    expect(s.errors).toEqual([{ code: "quota", count: 1 }]);
    expect(s.days.map((d) => [d.day, d.calls])).toEqual([["2026-11-09", 0], ["2026-11-10", 3], ["2026-11-11", 0]]);
  });

  it("byDay zero-fills and sums cost per day", () => {
    const d = byDay([row({ created_at: "2026-11-01T01:00:00Z", status: "error" }), row({ created_at: "2026-11-01T23:00:00Z" })], new Date("2026-11-01T00:00:00Z"), new Date("2026-11-02T00:00:00Z"));
    expect(d).toEqual([
      { day: "2026-11-01", calls: 2, errors: 1, costUsd: 0.002 },
      { day: "2026-11-02", calls: 0, errors: 0, costUsd: 0 },
    ]);
  });
});
