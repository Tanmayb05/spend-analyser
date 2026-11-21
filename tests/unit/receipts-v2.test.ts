import { describe, expect, it } from "vitest";
import { findCardLast4, monogram, networkOf, stripMemberNumbers } from "@/lib/receipts/card";
import { checkTotals, hasTextLayer } from "@/lib/receipts/validate";
import { checkPageCaps, groupByJoins, groupFiles, MAX_PAGES } from "@/lib/receipts/pages";
import { receiptHash, sha256Hex } from "@/lib/receipts/hash";
import { broaderSuggestions, matchedSoFar, rankCandidates, sameMerchant, type ReceiptTarget, type TxnCandidate } from "@/lib/receipts/match";
import { linkQuestions, planLink, type LinkFacts } from "@/lib/receipts/link";

describe("card last 4", () => {
  it.each([
    ["Visa 0092", "0092", "Visa"],
    ["DEBIT 2096", "2096", "Debit"],
    ["VISA 9992 AUTH 123", "9992", "Visa"],
    ["Visa ending in 4382", "4382", "Visa"],
    ["Card XXXX4382", "4382", null],
    ["XXXXXXXXXXX4382", "4382", null],
    ["Acct ending in 1675", "1675", null],
    ["Mastercard **** **** **** 1111", "1111", "Mastercard"],
  ])("reads %s", (text, last4, brand) => {
    const r = findCardLast4(text);
    expect(r?.last4).toBe(last4);
    if (brand) expect(r?.brand).toBe(brand);
  });

  it("never takes a loyalty or membership number as a card", () => {
    expect(findCardLast4("Kroger Plus Card #0823")).toBeNull();
    expect(findCardLast4("Member # 1234 5678 9012")).toBeNull();
    expect(findCardLast4("Visa")).toBeNull();
  });

  it("does not read an amount as digits", () => {
    expect(findCardLast4("Credit 1234.56")).toBeNull();
  });

  it("maps brands to networks and badges", () => {
    expect(networkOf("VISA")).toBe("visa");
    expect(networkOf("Master Card")).toBe("mastercard");
    expect(networkOf("Debit")).toBe("other");
    expect(networkOf(null)).toBeNull();
    expect(monogram("Chase", null, "Freedom")).toBe("CH");
    expect(monogram("American Express", null, "Gold")).toBe("AE");
    expect(monogram(null, "Daily", "x")).toBe("DA");
  });

  it("strips membership and loyalty numbers", () => {
    const out = stripMemberNumbers("Costco Member 111890123456\nKroger loyalty #0823\nTotal 12.00");
    expect(out).not.toMatch(/111890123456/);
    expect(out).not.toMatch(/0823/);
    expect(out).toContain("Total 12.00");
  });
});

describe("totals check", () => {
  const base = { fees: null, tax: null, discount: null, printed_item_count: null };
  it("accepts items + fees + tax - discount = total", () => {
    const r = checkTotals({ ...base, items: [{ total_price: 10 }, { total_price: 5.5 }], fees: 3.99, tax: 1.2, discount: 2, total: 18.69 });
    expect(r.ok).toBe(true);
    expect(r.expected).toBe(18.69);
  });
  it("tolerates one cent", () => {
    expect(checkTotals({ ...base, items: [{ total_price: 10 }], tax: 0.8, total: 10.81 }).ok).toBe(true);
    expect(checkTotals({ ...base, items: [{ total_price: 10 }], tax: 0.8, total: 10.85 }).ok).toBe(false);
  });
  it("flags an incomplete text layer (items short of the total)", () => {
    const r = checkTotals({ ...base, items: [{ total_price: 20 }, { total_price: 15 }], total: 77.94 });
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toMatch(/add up to 35.00/);
  });
  it("needs a total and items", () => {
    expect(checkTotals({ ...base, items: [], total: null }).reasons).toEqual(["No total found", "No items found"]);
  });
  it("checks the printed item count by lines or units", () => {
    const items = [{ total_price: 1, quantity: 2 }, { total_price: 1, quantity: 1 }];
    expect(checkTotals({ ...base, items, total: 2, printed_item_count: 3 }).ok).toBe(true);
    expect(checkTotals({ ...base, items, total: 2, printed_item_count: 2 }).ok).toBe(true);
    expect(checkTotals({ ...base, items, total: 2, printed_item_count: 9 }).ok).toBe(false);
  });
  it("detects whether a pdf has a text layer", () => {
    expect(hasTextLayer("1")).toBe(false);
    expect(hasTextLayer("Kroger ".repeat(30))).toBe(true);
  });
});

describe("pages", () => {
  it("groups files as one receipt or separate receipts", () => {
    expect(groupFiles(["a", "b", "c"], "one")).toEqual([["a", "b", "c"]]);
    expect(groupFiles(["a", "b"], "separate")).toEqual([["a"], ["b"]]);
    expect(groupFiles([], "one")).toEqual([]);
  });
  it("groups a bulk drop: a joined file is another page of the receipt above it", () => {
    expect(groupByJoins(["a", "b", "c", "d"], [false, false, true, false])).toEqual([["a"], ["b", "c"], ["d"]]);
    expect(groupByJoins(["a", "b"], [true, true])).toEqual([["a", "b"]]); // the first file always starts a receipt
    expect(groupByJoins(["a", "b", "c"], [false, true, true])).toEqual([["a", "b", "c"]]);
    expect(groupByJoins([], [])).toEqual([]);
  });
  it("applies page and size caps", () => {
    expect(checkPageCaps([])).toMatch(/at least one/);
    expect(checkPageCaps(Array.from({ length: MAX_PAGES + 1 }, () => ({ size: 1 })))).toMatch(/up to 10 pages/);
    expect(checkPageCaps([{ size: 15 * 1024 * 1024 }, { size: 6 * 1024 * 1024 }])).toMatch(/20 MB/);
    expect(checkPageCaps([{ size: 1000 }])).toBeNull();
  });
  it("hashes a single page as itself and a set in order", () => {
    const a = sha256Hex(new TextEncoder().encode("a"));
    const b = sha256Hex(new TextEncoder().encode("b"));
    expect(receiptHash([a])).toBe(a);
    expect(receiptHash([a, b])).toBe(receiptHash([a, b]));
    expect(receiptHash([a, b])).not.toBe(receiptHash([b, a]));
  });
});

const target = (over: Partial<ReceiptTarget> = {}): ReceiptTarget => ({
  date: "2026-11-09",
  total: 50,
  total_paid: null,
  currency: "USD",
  merchant: "Kroger",
  payment_method_id: "card1",
  order_type: "in_store",
  ...over,
});
const txn = (over: Partial<TxnCandidate> = {}): TxnCandidate => ({
  id: "t1",
  date: "2026-11-09",
  amount: 50,
  currency: "USD",
  merchant: "KROGER #123",
  payment_method_id: "card1",
  receipt_id: null,
  type: "expense",
  ...over,
});

describe("candidate ranking", () => {
  it("normalises merchants and uses aliases", () => {
    expect(sameMerchant("Kroger", "KROGER #123")).toBe(true);
    expect(sameMerchant("Amazon", "AMZN Mktp US", ["Amazon"])).toBe(true);
    expect(sameMerchant("Amazon", "AMZN Mktp US")).toBe(false);
    expect(sameMerchant("Kroger", "Ralphs")).toBe(false);
    expect(sameMerchant(null, "Ralphs")).toBe(false);
  });
  it("ranks the same amount, merchant and card first", () => {
    const out = rankCandidates(target(), [txn({ id: "far", date: "2026-11-12", merchant: "Other", payment_method_id: null }), txn({ id: "best" })]);
    expect(out.map((c) => c.txn.id)).toEqual(["best", "far"]);
    expect(out[0].reasons).toEqual(expect.arrayContaining(["same amount", "same merchant", "same card"]));
  });
  it("applies the date window: 7 days in store, 14 online", () => {
    const eight = txn({ date: "2026-11-17" });
    expect(rankCandidates(target(), [eight])).toHaveLength(0);
    expect(rankCandidates(target({ order_type: "online" }), [eight])).toHaveLength(1);
    expect(rankCandidates(target({ order_type: "online" }), [txn({ date: "2026-11-24" })])).toHaveLength(0);
  });
  it("accepts amounts from the total up to 130% (a tip), not above", () => {
    expect(rankCandidates(target(), [txn({ amount: 60 })])[0].reasons).toContain("amount includes a tip");
    expect(rankCandidates(target(), [txn({ amount: 65 })])).toHaveLength(1);
    expect(rankCandidates(target(), [txn({ amount: 65.01 })])).toHaveLength(0);
    expect(rankCandidates(target(), [txn({ amount: 40 })])).toHaveLength(0);
  });
  it("ranks the exact paid amount (total plus a tip read) highest", () => {
    const r = target({ total: 30.67, total_paid: 36.67 });
    const out = rankCandidates(r, [txn({ id: "printed", amount: 30.67 }), txn({ id: "paid", amount: 36.67 })]);
    expect(out[0].txn.id).toBe("paid");
  });
  it("lets a smaller transaction match an online order (one shipment)", () => {
    expect(rankCandidates(target({ order_type: "online" }), [txn({ amount: 20 })])[0].reasons).toContain("part of the order");
  });
  it("skips linked, non-expense and excluded transactions", () => {
    const list = [txn({ id: "linked", receipt_id: "r" }), txn({ id: "inc", type: "income" }), txn({ id: "ex" }), txn({ id: "ok" })];
    expect(rankCandidates(target(), list, { exclude: new Set(["ex"]) }).map((c) => c.txn.id)).toEqual(["ok"]);
  });
  it("keeps a different-currency candidate only when the merchant matches", () => {
    expect(rankCandidates(target(), [txn({ currency: "INR", amount: 4000 })])[0].reasons).toContain("different currency");
    expect(rankCandidates(target(), [txn({ currency: "INR", amount: 4000, merchant: "Other" })])).toHaveLength(0);
  });
  it("still matches a receipt without a date", () => {
    expect(rankCandidates(target({ date: null }), [txn({ date: "2020-01-01" })])).toHaveLength(1);
  });
  it("suggests same merchant or same card when nothing fits", () => {
    const list = [txn({ id: "m", amount: 5, date: "2026-11-01" }), txn({ id: "c", amount: 5, merchant: "X", date: "2026-11-10" }), txn({ id: "n", amount: 5, merchant: "X", payment_method_id: null })];
    const out = broaderSuggestions(target(), list);
    expect(out.map((c) => c.txn.id)).toEqual(["m", "c"].sort((a, b) => out.findIndex((o) => o.txn.id === a) - out.findIndex((o) => o.txn.id === b)));
    expect(out.map((c) => c.txn.id)).not.toContain("n");
  });
  it("tracks how much of a split order is matched", () => {
    expect(matchedSoFar(100, [{ amount: 40 }, { amount: 35 }])).toEqual({ matched: 75, remaining: 25, complete: false });
    expect(matchedSoFar(100, [{ amount: 60 }, { amount: 40 }]).complete).toBe(true);
  });
});

const facts = (over: { receipt?: Partial<LinkFacts["receipt"]>; txn?: Partial<LinkFacts["txn"]>; split?: boolean } = {}): LinkFacts => ({
  receipt: { merchant: "Kroger", date: "2026-11-09", total: 50, tip: null, currency: "USD", payment_method_id: "card1", ...over.receipt },
  txn: { merchant: "Kroger", date: "2026-11-10", amount: 50, currency: "USD", payment_method_id: null, ...over.txn },
  split: over.split ?? false,
});
const choices = { merchant: "txn", currency: "txn", takeDate: false } as const;

describe("link rules", () => {
  it("asks nothing when everything agrees", () => {
    expect(linkQuestions(facts())).toEqual({ merchant: false, currency: false, leftover: null });
  });
  it("receipt date, total and card win on a single link", () => {
    const { patch } = planLink(facts({ txn: { amount: 49.5 } }), choices);
    expect(patch).toEqual({ date: "2026-11-09", amount: 50, payment_method_id: "card1" });
  });
  it("a lower transaction takes the receipt amount with no prompt", () => {
    const f = facts({ txn: { amount: 48 } });
    expect(linkQuestions(f).leftover).toBeNull();
    expect(planLink(f, choices).patch.amount).toBe(50);
  });
  it("a higher transaction prompts for the leftover", () => {
    const q = linkQuestions(facts({ txn: { amount: 60 } }));
    expect(q.leftover).toEqual({ amount: 10, suggested: null, suggestedAmount: null });
  });
  it("a tip read from the receipt pre-fills the leftover", () => {
    const q = linkQuestions(facts({ receipt: { total: 30.67, tip: 6 }, txn: { amount: 36.67 } }));
    expect(q.leftover).toEqual({ amount: 6, suggested: "tip", suggestedAmount: 6 });
    const off = linkQuestions(facts({ receipt: { total: 30.67, tip: 5 }, txn: { amount: 36.67 } }));
    expect(off.leftover).toEqual({ amount: 6, suggested: "tip", suggestedAmount: 6 });
  });
  it("split mode keeps the charged amount and asks for the date", () => {
    const f = facts({ split: true, txn: { amount: 20 } });
    expect(linkQuestions(f).leftover).toBeNull();
    expect(planLink(f, choices).patch.amount).toBeUndefined();
    expect(planLink(f, choices).patch.date).toBeUndefined();
    expect(planLink(f, { ...choices, takeDate: true }).patch.date).toBe("2026-11-09");
  });
  it("asks about merchant and offers alias, receipt or transaction name", () => {
    const f = facts({ receipt: { merchant: "Kroger Fuel" }, txn: { merchant: "Shell" } });
    expect(linkQuestions(f).merchant).toBe(true);
    expect(planLink(f, { ...choices, merchant: "receipt" }).patch.merchant_name).toBe("Kroger Fuel");
    expect(planLink(f, { ...choices, merchant: "txn" })).toMatchObject({ alias: null });
    expect(planLink(f, { ...choices, merchant: "alias" }).alias).toBe("Kroger Fuel");
    expect(planLink(f, { ...choices, merchant: "alias" }).patch.merchant_name).toBeUndefined();
  });
  it("fills a missing transaction merchant from the receipt", () => {
    expect(planLink(facts({ txn: { merchant: null } }), choices).patch.merchant_name).toBe("Kroger");
  });
  it("asks which currency wins and skips the leftover", () => {
    const f = facts({ txn: { currency: "INR", amount: 4000 } });
    const q = linkQuestions(f);
    expect(q).toMatchObject({ currency: true, leftover: null });
    expect(planLink(f, choices).patch.currency).toBeUndefined();
    const p = planLink(f, { ...choices, currency: "receipt" }).patch;
    expect(p).toMatchObject({ currency: "USD", amount: 50 });
  });
});

import { extractionFromReview, labelFromFileName, normalizeExtraction, scrubExtraction, totalPaidOf, type ReviewedReceipt } from "@/lib/receipts/extract";

describe("receipt extraction helpers", () => {
  it("makes a label from the file name, never from camera names", () => {
    expect(labelFromFileName("2025 09 11 - Antara Gift 1.pdf")).toBe("Antara Gift 1");
    expect(labelFromFileName("The Whitfield - 2024 09 - Rent Receipt.pdf")).toBe("The Whitfield - 2024 09 - Rent Receipt");
    expect(labelFromFileName("IMG_0412.jpeg")).toBeNull();
    expect(labelFromFileName("Screenshot 2026-11-02 at 10.30.11.png")).toBeNull();
    expect(labelFromFileName("2024 12 07 - Clifton.pdf")).toBe("Clifton");
    expect(labelFromFileName("123456.pdf")).toBeNull();
    expect(labelFromFileName(null)).toBeNull();
  });
  it("fills new fields on an old stored extraction", () => {
    const e = normalizeExtraction({ merchant: "X", total: 5, items: [{ raw_name: "a", normalized_name: "a", item_category: "x", quantity: 1, unit: null, unit_price: 5, total_price: 5, category: "c", subcategory: null }] });
    expect(e.tip_source).toBe("none");
    expect(e.items[0].is_weighted).toBe(false);
    expect(e.card_last4).toBeNull();
    expect(normalizeExtraction(null).items).toEqual([]);
  });
  it("computes total paid from a handwritten tip or total", () => {
    expect(totalPaidOf({ total: 30.67, tip: 6, tip_source: "handwritten", written_total: 36.67 })).toBe(36.67);
    expect(totalPaidOf({ total: 30.67, tip: 6, tip_source: "handwritten", written_total: null })).toBe(36.67);
    expect(totalPaidOf({ total: 30.67, tip: 6, tip_source: "handwritten", written_total: 20 })).toBe(36.67);
    expect(totalPaidOf({ total: 30.67, tip: 4, tip_source: "printed", written_total: null })).toBe(30.67);
    expect(totalPaidOf({ total: null, tip: null, tip_source: "none", written_total: null })).toBeNull();
  });
  it("scrubs member numbers from free text", () => {
    const e = normalizeExtraction({ merchant: "Costco Member 111890123456", items: [] });
    expect(scrubExtraction(e).merchant).not.toMatch(/111890123456/);
  });
});

describe("extraction follows the reviewed receipt", () => {
  const prev = normalizeExtraction({ merchant: "KROGER #123", date: "2026-11-09", total: 20, written_total: 25, printed_item_count: 2, items: [{ raw_name: "MILK", normalized_name: "Milk", item_category: "Dairy", total_price: 4, category: "Groceries", subcategory: null }] });
  const reviewed: ReviewedReceipt = {
    merchant: "Kroger",
    date: "2026-11-10",
    currency: "USD",
    subtotal: 18,
    tax: 2,
    discount: null,
    fees: null,
    total: 20.5,
    tip: null,
    tipSource: "none",
    cardLast4: "0092",
    cardBrand: "Visa",
    orderType: "delivery",
    orderNumber: null,
    storeAddress: null,
    items: [{ raw_name: "MILK", normalized_name: "Whole Milk", item_category: "Dairy", quantity: 1, unit: null, unit_price: null, total_price: 4.5, list_price: null, line_discount: null, upc: null, tax_code: null, is_weighted: false, category_id: "c1", subcategory_id: "" }],
  };
  const out = extractionFromReview(prev, reviewed, (c) => ({ category: c === "c1" ? "Groceries" : "", subcategory: null }));

  it("keeps edits to header fields and items, with category names back from ids", () => {
    expect(out.merchant).toBe("Kroger");
    expect(out.date).toBe("2026-11-10");
    expect(out.total).toBe(20.5);
    expect(out.items[0]).toMatchObject({ normalized_name: "Whole Milk", total_price: 4.5, category: "Groceries", subcategory: null });
    expect(out.items[0]).not.toHaveProperty("category_id");
  });
  it("keeps what review cannot change", () => {
    expect(out.written_total).toBe(25);
    expect(out.printed_item_count).toBe(2);
  });
});
