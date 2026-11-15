import { describe, expect, it } from "vitest";
import { tripPartColors } from "@/components/charts/colors";

describe("tripPartColors", () => {
  it("gives Flights, Stay and Food fixed, distinct colors regardless of order", () => {
    const a = tripPartColors(["Food", "Stay", "Flights"]);
    const b = tripPartColors(["Flights", "Souvenirs", "Stay", "Food"]);
    for (const l of ["Flights", "Stay", "Food"]) expect(a.get(l)).toBe(b.get(l));
    expect(new Set(["Flights", "Stay", "Food"].map((l) => a.get(l))).size).toBe(3);
  });

  it("matches fixed names case-insensitively", () => {
    expect(tripPartColors(["flights"]).get("flights")).toBe(tripPartColors(["Flights"]).get("Flights"));
  });

  it("gives every other part its own color, different from the fixed three", () => {
    const labels = ["Flights", "Stay", "Food", "Transport", "Activities", "Souvenirs", "Shopping", "Gifts"];
    const m = tripPartColors(labels);
    expect(new Set(labels.map((l) => m.get(l))).size).toBe(labels.length);
  });

  it("falls back to neutral once the palette runs out", () => {
    const labels = ["a", "b", "c", "d", "e", "f", "g"];
    const m = tripPartColors(labels);
    expect(m.get("f")).toBe("var(--c-other)");
    expect(m.get("g")).toBe("var(--c-other)");
    expect(m.get("e")).not.toBe("var(--c-other)");
  });

  it("is stable: same label always maps to one color", () => {
    const m = tripPartColors(["Transport", "Transport"]);
    expect(m.size).toBe(1);
  });
});
