import { describe, expect, it } from "vitest";
import { merchantContext } from "@/lib/analytics/txn-context";

const money = (n: number) => `$${n.toFixed(2)}`;
const opts = { merchant: "Netflix", money };
const h = (date: string, amount: number) => ({ date, amount });

describe("merchantContext", () => {
  it("returns null with no earlier charges", () => {
    expect(merchantContext({ amount: 15.49, date: "2026-11-20" }, [], opts)).toBeNull();
    expect(merchantContext({ amount: 15.49, date: "2026-11-20" }, [h("2026-12-01", 15.49)], opts)).toBeNull();
  });

  it("says same every time when all earlier charges match", () => {
    const c = merchantContext({ amount: 15.49, date: "2026-11-20" }, [h("2026-10-20", 15.49), h("2026-09-20", 15.49), h("2026-08-20", 15.5)], opts)!;
    expect(c.headline).toBe("Same every time");
    expect(c.tone).toBe("good");
    expect(c.spark).toEqual([15.5, 15.49, 15.49, 15.49]);
  });

  it("says same as last time with a single earlier charge", () => {
    expect(merchantContext({ amount: 10, date: "2026-02-01" }, [h("2026-01-01", 10)], opts)!.headline).toBe("Same as last time");
  });

  it("flags a charge above the usual as a warning for spending", () => {
    const c = merchantContext({ amount: 59.19, date: "2026-11-11" }, [h("2026-10-01", 48), h("2026-09-01", 52), h("2026-08-01", 51)], opts)!;
    expect(c.headline).toBe("$8.86 above your usual here");
    expect(c.tone).toBe("warn");
    expect(c.detail).toContain("Average at Netflix: $50.33 over 3 earlier charges");
  });

  it("treats a lower charge as good for spending, and a higher one as good for income", () => {
    const hist = [h("2026-10-01", 100), h("2026-09-01", 120)];
    expect(merchantContext({ amount: 80, date: "2026-11-01" }, hist, opts)!.tone).toBe("good");
    expect(merchantContext({ amount: 150, date: "2026-11-01", income: true }, hist, opts)!.tone).toBe("good");
    expect(merchantContext({ amount: 80, date: "2026-11-01", income: true }, hist, opts)!.tone).toBe("warn");
  });

  it("calls a small difference in line with the usual", () => {
    const c = merchantContext({ amount: 51, date: "2026-11-01" }, [h("2026-10-01", 50), h("2026-09-01", 53)], opts)!;
    expect(c.headline).toBe("In line with your usual here");
    expect(c.tone).toBe("muted");
  });

  it("keeps only the latest sparkline points and uses absolute amounts", () => {
    const hist = Array.from({ length: 10 }, (_, i) => h(`2026-0${(i % 9) + 1}-15`, -(20 + i)));
    const c = merchantContext({ amount: -40, date: "2026-12-01" }, hist, opts)!;
    expect(c.spark).toHaveLength(7);
    expect(c.spark.at(-1)).toBe(40);
  });
});
