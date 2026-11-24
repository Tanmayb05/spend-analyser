import { describe, expect, it } from "vitest";
import { packFields } from "@/lib/detail-grid";

const spans = (fs: { key: string; wide?: boolean }[]) => packFields(fs).map((f) => f.span);

describe("packFields", () => {
  it("pairs half-width fields", () => {
    expect(spans([{ key: "a" }, { key: "b" }])).toEqual([1, 1]);
  });
  it("stretches a lone last field", () => {
    expect(spans([{ key: "a" }, { key: "b" }, { key: "c" }])).toEqual([1, 1, 2]);
  });
  it("stretches a field whose next neighbour is wide", () => {
    expect(spans([{ key: "a" }, { key: "w", wide: true }, { key: "b" }, { key: "c" }])).toEqual([2, 2, 1, 1]);
  });
  it("keeps wide fields full width and handles empty input", () => {
    expect(spans([{ key: "w", wide: true }])).toEqual([2]);
    expect(packFields([])).toEqual([]);
  });
  it("never leaves an odd column: total span is always even", () => {
    for (let n = 1; n < 8; n++) {
      for (let mask = 0; mask < 1 << n; mask++) {
        const fs = Array.from({ length: n }, (_, i) => ({ key: String(i), wide: Boolean(mask & (1 << i)) }));
        expect(packFields(fs).reduce((a, f) => a + f.span, 0) % 2).toBe(0);
      }
    }
  });
});
