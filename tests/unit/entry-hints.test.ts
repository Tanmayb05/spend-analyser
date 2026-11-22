import { describe, expect, it } from "vitest";
import { buildEntryHints, EMPTY_HINTS, type HintRow } from "@/lib/entry-hints";

const row = (o: Partial<HintRow>): HintRow => ({
  type: "expense",
  category_id: "c1",
  subcategory_id: null,
  merchant_id: null,
  payment_method_id: null,
  paid_by_id: null,
  ...o,
});

describe("buildEntryHints", () => {
  it("is empty without history", () => {
    expect(buildEntryHints([])).toEqual(EMPTY_HINTS);
  });
  it("ranks categories by use, per kind; refunds count as expenses", () => {
    const h = buildEntryHints([
      row({ category_id: "food" }),
      row({ category_id: "gas" }),
      row({ category_id: "gas", type: "refund" }),
      row({ category_id: "pay", type: "income" }),
    ]);
    expect(h.topCategories.expense).toEqual(["gas", "food"]);
    expect(h.topCategories.income).toEqual(["pay"]);
  });
  it("breaks ties by most recent use (rows are newest first)", () => {
    const h = buildEntryHints([row({ category_id: "b" }), row({ category_id: "a" })]);
    expect(h.topCategories.expense).toEqual(["b", "a"]);
  });
  it("remembers the newest transaction's details per merchant", () => {
    const h = buildEntryHints([
      row({ merchant_id: "m1", category_id: "food", subcategory_id: "s1", payment_method_id: "visa", paid_by_id: "me" }),
      row({ merchant_id: "m1", category_id: "other", payment_method_id: "cash" }),
      row({ merchant_id: "m2", category_id: "gas" }),
      row({ merchant_id: "m2", category_id: "gas" }),
      row({ merchant_id: "m2", category_id: "gas" }),
    ]);
    expect(h.lastByMerchant.m1).toEqual({ category_id: "food", subcategory_id: "s1", payment_method_id: "visa", paid_by_id: "me" });
    expect(h.topMerchants).toEqual(["m2", "m1"]);
  });
  it("ignores rows without a merchant for merchant hints", () => {
    const h = buildEntryHints([row({})]);
    expect(h.topMerchants).toEqual([]);
    expect(h.lastByMerchant).toEqual({});
  });
});
