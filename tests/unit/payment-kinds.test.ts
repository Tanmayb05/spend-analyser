import { describe, expect, it } from "vitest";
import { inferKind, isCardKind, KIND_LIST, KIND_META, KINDS, kindMeta } from "@/lib/payment-kinds";

describe("payment kinds", () => {
  it("lists seven types, each with a label and icon", () => {
    expect(KINDS).toHaveLength(7);
    expect(KIND_LIST.map((k) => k.value)).toEqual([...KINDS]);
    for (const k of KIND_LIST) {
      expect(k.label).toBeTruthy();
      expect(k.icon).toBeTruthy();
    }
  });

  it("only cards carry issuer, network and last 4 digits", () => {
    expect(KIND_META.credit_card.fields).toMatchObject({ nickname: true, issuer: true, network: true, last4s: true, creditTerms: true });
    expect(KIND_META.debit_card.fields).toMatchObject({ issuer: true, issuerLabel: "Bank", network: true, last4s: true, creditTerms: false });
    expect(KIND_META.prepaid.fields).toMatchObject({ last4s: true, issuer: false, network: false });
    expect(KIND_META.bank_account.fields).toMatchObject({ issuer: true, issuerLabel: "Bank", network: false, last4s: false });
    for (const k of ["wallet", "cash", "other"] as const) {
      expect(KIND_META[k].fields).toMatchObject({ nickname: false, issuer: false, network: false, last4s: false, creditTerms: false });
    }
  });

  it("only credit cards have credit terms", () => {
    expect(KIND_LIST.filter((k) => k.fields.creditTerms).map((k) => k.value)).toEqual(["credit_card"]);
  });

  it("falls back to Other for unknown values", () => {
    expect(kindMeta("something-new").value).toBe("other");
    expect(kindMeta(null).value).toBe("other");
    expect(kindMeta("wallet").value).toBe("wallet");
  });

  it("isCardKind covers credit, debit and prepaid", () => {
    expect(["credit_card", "debit_card", "prepaid"].every((k) => isCardKind(k as never))).toBe(true);
    expect(["bank_account", "wallet", "cash", "other"].some((k) => isCardKind(k as never))).toBe(false);
  });

  it.each([
    ["Venmo", "wallet"],
    ["Apple Pay", "wallet"],
    ["Zelle/Venmo", "wallet"],
    ["UPI / Wallet", "wallet"],
    ["Cash", "cash"],
    ["Chase Debit", "debit_card"],
    ["Amex Gold", "credit_card"],
    ["Chase Sapphire", "credit_card"],
    ["Starbucks gift card", "prepaid"],
    ["Bank Transfer", "bank_account"],
    ["Savings account", "bank_account"],
  ])("guesses %s as %s", (name, kind) => {
    expect(inferKind(name)).toBe(kind);
  });

  it("returns null when nothing fits", () => {
    expect(inferKind("")).toBeNull();
    expect(inferKind("Paid by Friend")).toBeNull();
  });
});
