import { describe, expect, it } from "vitest";
import { buildSchedule, monthsForAmount } from "@/lib/installments";

describe("buildSchedule (mirrors SQL regen_installments)", () => {
  it("splits evenly", () => {
    const s = buildSchedule({ total: 1200, months: 12, startMonth: "2026-09-01", dayOfMonth: 20 });
    expect(s).toHaveLength(12);
    expect(s.every((r) => r.amount === 100)).toBe(true);
    expect(s[1].due).toBe("2026-10-20");
    expect(s[11].due).toBe("2027-08-20");
  });
  it("last row absorbs rounding", () => {
    expect(buildSchedule({ total: 100, months: 3, startMonth: "2026-01-01", dayOfMonth: 31 }).map((r) => r.amount)).toEqual([33.33, 33.33, 33.34]);
  });
  it("clamps day to month end", () => {
    expect(buildSchedule({ total: 100, months: 3, startMonth: "2026-01-01", dayOfMonth: 31 })[1].due).toBe("2026-02-28");
  });
  it("fixed installment amount, remainder last", () => {
    expect(buildSchedule({ total: 1250, months: 13, startMonth: "2026-01-01", dayOfMonth: 1, installmentAmount: 100 }).at(-1)?.amount).toBe(50);
  });
  it("rejects amount that already covers total", () => {
    expect(buildSchedule({ total: 100, months: 3, startMonth: "2026-01-01", dayOfMonth: 1, installmentAmount: 60 })).toEqual([]);
  });
  it("months from per-month amount", () => {
    expect(monthsForAmount(1200, 100)).toBe(12);
    expect(monthsForAmount(1250, 100)).toBe(13);
    expect(monthsForAmount(0, 100)).toBe(0);
  });
});
