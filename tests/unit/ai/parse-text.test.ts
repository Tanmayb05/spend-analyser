import { describe, expect, it } from "vitest";
import { matchByName, paymentLine, toPreset } from "@/lib/ai/parse-text";
import type { ParsedTxn } from "@/lib/ai/schemas";

const trips = [
  { id: "t1", name: "Goa 2026", start_date: "2026-11-01", end_date: "2026-11-07" },
  { id: "t2", name: "Chicago", start_date: null, end_date: null },
];
const payments = [
  { id: "p1", name: "Chase Sapphire", nickname: "sapphire", issuer: "Chase", network: "Visa" },
  { id: "p2", name: "Cash", nickname: null, issuer: null, network: null },
  { id: "p3", name: "Amex Gold", nickname: null, issuer: "Amex", network: null },
  { id: "p4", name: "Amex Blue", nickname: null, issuer: "Amex", network: null },
];
const people = [
  { id: "me", name: "Tanmay", is_self: true },
  { id: "pr", name: "Priya", is_self: false },
];
const ctx = { cats: [], subs: [], trips, payments, people };
const cat = { category_id: "c1", subcategory_id: "" };
const parsed = (o: Partial<ParsedTxn> = {}): ParsedTxn => ({
  date: "2026-11-20", type: "expense", amount: 12.5, currency: "USD", category: "Food", subcategory: null, merchant: "Kroger", description: null,
  trip: null, payment_method: null, paid_by: null, notes: null, ...o,
});

describe("matchByName", () => {
  it("matches case- and punctuation-insensitively", () => expect(matchByName(trips, "goa-2026", (t) => [t.name])?.id).toBe("t1"));
  it("matches a short spoken form inside a longer name", () => expect(matchByName(trips, "Goa", (t) => [t.name])?.id).toBe("t1"));
  it("matches a nickname or issuer + network", () => {
    const labels = (m: (typeof payments)[number]) => [m.name, m.nickname, m.issuer, [m.issuer, m.network].filter(Boolean).join(" ")];
    expect(matchByName(payments, "Sapphire", labels)?.id).toBe("p1");
    expect(matchByName(payments, "chase visa", labels)?.id).toBe("p1");
  });
  it("leaves an ambiguous match empty", () => expect(matchByName(payments, "Amex", (m) => [m.issuer])).toBeUndefined());
  it("returns nothing for empty or unknown input", () => {
    expect(matchByName(trips, null, (t) => [t.name])).toBeUndefined();
    expect(matchByName(trips, "Paris", (t) => [t.name])).toBeUndefined();
  });
});

describe("toPreset", () => {
  it("fills payment, payer, trip and notes when the note gave them", () => {
    const r = toPreset(parsed({ trip: "goa 2026", payment_method: "Cash", paid_by: "Priya", notes: " with the team " }), ctx, cat);
    expect(r).toMatchObject({ trip_id: "t1", payment_method_id: "p2", paid_by_id: "pr", notes: "with the team", amount: "12.5", merchant_name: "Kroger", source: "text" });
  });
  it("omits unset fields so the form defaults (default card, you as payer) stay", () => {
    const r = toPreset(parsed(), ctx, cat);
    for (const k of ["trip_id", "payment_method_id", "paid_by_id", "notes"]) expect(r).not.toHaveProperty(k);
  });
  it("drops names that match nothing in the user's lists", () => {
    const r = toPreset(parsed({ trip: "Paris", payment_method: "Bitcoin", paid_by: "Zed" }), ctx, cat);
    expect(r).not.toHaveProperty("trip_id");
    expect(r).not.toHaveProperty("payment_method_id");
    expect(r).not.toHaveProperty("paid_by_id");
  });
});

describe("paymentLine", () => {
  it("adds nickname and issuer so the model can match spoken names", () => {
    expect(paymentLine(payments[0])).toBe("Chase Sapphire (sapphire; Chase Visa)");
    expect(paymentLine(payments[1])).toBe("Cash");
  });
});
