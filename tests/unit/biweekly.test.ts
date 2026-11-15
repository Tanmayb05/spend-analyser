import { describe, expect, it } from "vitest";
import { biweeklyDates } from "@/lib/biweekly";
import { transactionSchema } from "@/lib/validation/transaction";

describe("biweeklyDates", () => {
  it("starts on the given date and steps 14 days", () => {
    expect(biweeklyDates("2026-11-06", 3)).toEqual(["2026-11-06", "2026-11-20", "2026-12-04"]);
  });

  it("crosses month and year ends", () => {
    expect(biweeklyDates("2026-12-18", 3)).toEqual(["2026-12-18", "2027-01-01", "2027-01-15"]);
  });

  it("handles leap days", () => {
    expect(biweeklyDates("2028-02-15", 2)).toEqual(["2028-02-15", "2028-02-29"]);
  });

  it("is not moved by daylight-saving changes", () => {
    // US spring-forward 2026-03-08, fall-back 2026-11-01
    expect(biweeklyDates("2026-03-01", 3)).toEqual(["2026-03-01", "2026-03-15", "2026-03-29"]);
    expect(biweeklyDates("2026-10-25", 3)).toEqual(["2026-10-25", "2026-11-08", "2026-11-22"]);
  });

  it("makes a full year with 26 paychecks, 14 days apart", () => {
    const d = biweeklyDates("2026-01-02", 26);
    expect(d).toHaveLength(26);
    expect(d.at(-1)).toBe("2026-12-18"); // 25 steps of 14 days = 350 days after Jan 2
    for (let i = 1; i < d.length; i++) expect((Date.parse(d[i]) - Date.parse(d[i - 1])) / 86_400_000).toBe(14);
  });

  it("returns nothing for a zero or negative count", () => {
    expect(biweeklyDates("2026-01-02", 0)).toEqual([]);
    expect(biweeklyDates("2026-01-02", -3)).toEqual([]);
  });
});

describe("bi-weekly repeat validation", () => {
  const income = {
    date: "2026-11-06",
    type: "income" as const,
    category_id: "00000000-0000-4000-8000-000000000001",
    amount: "2000",
    currency: "USD",
  };
  const repeat = { kind: "biweekly" as const, count: 26 };

  it("accepts a bi-weekly repeat on new income", () => {
    expect(transactionSchema.parse({ ...income, repeat }).repeat).toEqual(repeat);
  });

  it("defaults to no repeat", () => {
    expect(transactionSchema.parse(income).repeat).toBeNull();
  });

  it("coerces a string count", () => {
    expect(transactionSchema.parse({ ...income, repeat: { kind: "biweekly", count: "12" } }).repeat?.count).toBe(12);
  });

  it("rejects counts that are too small, too large or fractional", () => {
    for (const count of [1, 53, 2.5, "x"]) {
      expect(transactionSchema.safeParse({ ...income, repeat: { kind: "biweekly", count } }).success).toBe(false);
    }
  });

  it("only allows repeat on new income without a plan or trip", () => {
    expect(transactionSchema.safeParse({ ...income, type: "expense", repeat }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...income, id: "00000000-0000-4000-8000-0000000000aa", repeat }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...income, trip_id: "00000000-0000-4000-8000-0000000000bb", repeat }).success).toBe(false);
    expect(
      transactionSchema.safeParse({ ...income, plan: { kind: "spread", months: 3, start_month: "2026-11-01" }, repeat }).success,
    ).toBe(false);
  });
});
