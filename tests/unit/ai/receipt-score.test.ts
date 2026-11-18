import { describe, expect, it } from "vitest";
import { isConsistent, scoreReceipt, summarise, type ReceiptTruth } from "@/lib/ai/receipt-score";
import type { ReceiptExtraction } from "@/lib/ai/schemas";

const item = (raw_name: string, total_price: number) => ({
  raw_name, normalized_name: raw_name, item_category: "Produce", quantity: 1, unit: null, unit_price: total_price, total_price, category: "Groceries", subcategory: null,
});
const truth: ReceiptTruth = {
  file: "k.pdf", merchant: ["kroger"], date: "2026-11-09", total: [10.5], tax: 0.5,
  items: [{ name: "Fresh Bananas", price: 4 }, { name: "Garlic", price: 6 }, { name: "Tomato (unavailable)", price: 3, optional: true }],
};
const perfect: ReceiptExtraction = {
  merchant: "Kroger #512", date: "2026-11-09", currency: "USD", subtotal: 10, tax: 0.5, discount: null, total: 10.5,
  items: [item("BANANAS", 4), item("GARLIC", 6)],
};

describe("receipt read score", () => {
  it("gives 100 and ready to a perfect read", () => {
    const s = scoreReceipt(truth, perfect);
    expect(s.score).toBe(100);
    expect(s.ready).toBe(true);
    expect(s.items.namesOk).toBe(2);
    expect(s.consistent).toBe(true);
  });

  it("a wrong total costs 25 and is not ready", () => {
    const s = scoreReceipt(truth, { ...perfect, total: 11 });
    expect(s.score).toBe(75);
    expect(s.ready).toBe(false);
  });

  it("an optional line neither helps nor hurts", () => {
    expect(scoreReceipt(truth, { ...perfect, items: [...perfect.items, item("TOMATO", 3)] }).score).toBe(100);
  });

  it("invented and missed items lower F1", () => {
    const s = scoreReceipt(truth, { ...perfect, items: [item("BANANAS", 4), item("CHIPS", 2.5)] });
    expect(s.items).toMatchObject({ matched: 1, precision: 0.5, recall: 0.5 });
    expect(s.extra).toEqual([{ name: "CHIPS", price: 2.5 }]);
    expect(s.missing).toEqual([{ name: "Garlic", price: 6 }]);
    expect(s.score).toBe(75);
  });

  it("skips tax when the label has none and accepts null merchant/date when nothing is printed", () => {
    const t: ReceiptTruth = { file: "s.pdf", merchant: ["shein", null], date: null, total: [14.14], tax: null, items: [] };
    const s = scoreReceipt(t, { ...perfect, merchant: null, date: null, tax: 9, total: 14.14, items: [] });
    expect(s.fields.tax).toBeNull();
    expect(s.score).toBe(100);
    expect(scoreReceipt(t, { ...perfect, merchant: null, date: null, total: 14.14, items: [item("T-SHIRT", 14.14)] }).score).toBe(50);
  });

  it("flags arithmetic that doesn't add up", () => {
    expect(isConsistent({ ...perfect, subtotal: null, total: 30 })).toBe(false);
  });

  it("summarises a run, counting failures as zero", () => {
    const s = summarise([
      { score: scoreReceipt(truth, perfect), error: null, ms: 1000, tokensIn: 100, tokensOut: 50 },
      { score: null, error: "timeout", ms: 3000, tokensIn: null, tokensOut: null },
    ]);
    expect(s).toMatchObject({ receipts: 2, failed: 1, rrs: 50, readyPct: 50, itemRecallPct: 100, tokensIn: 100 });
  });
});
