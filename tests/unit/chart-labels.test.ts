import { describe, expect, it } from "vitest";
import { MOBILE_LABEL_THIN_FROM, thinnedOnPhone } from "@/lib/chart-labels";
import { formatMonthYearShort } from "@/lib/dates";

describe("thinnedOnPhone", () => {
  it("keeps every label on short charts", () => {
    for (let i = 0; i < MOBILE_LABEL_THIN_FROM - 1; i++) expect(thinnedOnPhone(i, MOBILE_LABEL_THIN_FROM - 1)).toBe(false);
  });
  it("hides every other label from 12 bars up, keeping the first", () => {
    const hidden = Array.from({ length: 12 }, (_, i) => thinnedOnPhone(i, 12));
    expect(hidden).toEqual([false, true, false, true, false, true, false, true, false, true, false, true]);
    expect(thinnedOnPhone(0, 24)).toBe(false);
    expect(thinnedOnPhone(1, 24)).toBe(true);
  });
});

describe("formatMonthYearShort", () => {
  it("is the short month and the year", () => {
    expect(formatMonthYearShort("2026-09-01")).toBe("Sep 2026");
    expect(formatMonthYearShort("2027-01-01")).toBe("Jan 2027");
  });
});
