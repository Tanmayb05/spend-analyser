import { describe, expect, it } from "vitest";
import { settleSentence, settleUp, type SettleTxn } from "@/lib/analytics/settle-up";

const people = [
  { id: "me", name: "Tan", is_self: true },
  { id: "sam", name: "Sam" },
  { id: "ria", name: "Ria Patel" },
];
const t = (type: SettleTxn["type"], paid_by_id: string | null, base_amount: number | null): SettleTxn => ({ type, paid_by_id, base_amount });

describe("settleUp", () => {
  it("is empty with no data", () => {
    expect(settleUp([], people)).toEqual({ youPaid: 0, rows: [], totalNet: 0 });
  });
  it("counts what others fronted as owed by you", () => {
    const r = settleUp([t("expense", "sam", 30), t("expense", "sam", 12.1)], people);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ id: "sam", fronted: 42.1, refunded: 0, net: 42.1, initials: "S" });
    expect(r.totalNet).toBe(42.1);
  });
  it("treats self and unpaid-by as you paying, with no debt", () => {
    const r = settleUp([t("expense", "me", 50), t("expense", null, 25), t("expense", "sam", 10)], people);
    expect(r.youPaid).toBe(75);
    expect(r.rows.map((x) => x.id)).toEqual(["sam"]);
  });
  it("nets refunds against what a person fronted, and can flip to owed to you", () => {
    const a = settleUp([t("expense", "sam", 40), t("refund", "sam", 15)], people);
    expect(a.rows[0].net).toBe(25);
    const b = settleUp([t("expense", "sam", 10), t("refund", "sam", 25)], people);
    expect(b.rows[0].net).toBe(-15);
    expect(b.totalNet).toBe(-15);
  });
  it("refunds to you lower what you paid; income is ignored", () => {
    const r = settleUp([t("expense", "me", 100), t("refund", "me", 20), t("income", "sam", 500), t("income", "me", 900)], people);
    expect(r.youPaid).toBe(80);
    expect(r.rows).toEqual([]);
  });
  it("ignores a payer that no longer exists and null amounts", () => {
    const r = settleUp([t("expense", "gone", 9), t("expense", "sam", null)], people);
    expect(r.youPaid).toBe(9);
    expect(r.rows[0].net).toBe(0);
  });
  it("sorts by the biggest balance either way and scales the bars to the widest", () => {
    const r = settleUp([t("expense", "me", 100), t("expense", "sam", 20), t("expense", "ria", 50), t("refund", "ria", 90)], people);
    expect(r.rows.map((x) => x.id)).toEqual(["ria", "sam"]);
    expect(r.rows[0].net).toBe(-40);
    // widest bar is you at 100
    expect(r.rows[0].youShare).toBe(1);
    expect(r.rows[0].theyShare).toBe(0.5);
    expect(r.rows[1].theyShare).toBe(0.2);
  });
  it("gives a stable chart colour 1..8", () => {
    const r = settleUp([t("expense", "sam", 1), t("expense", "ria", 1)], people);
    for (const row of r.rows) {
      expect(row.color).toBeGreaterThanOrEqual(1);
      expect(row.color).toBeLessThanOrEqual(8);
    }
    expect(settleUp([t("expense", "sam", 1)], people).rows[0].color).toBe(r.rows.find((x) => x.id === "sam")!.color);
  });
});

describe("settleSentence", () => {
  it("reads plainly in each direction", () => {
    expect(settleSentence("Sam", 42.1, "$42.10")).toBe("You owe Sam $42.10");
    expect(settleSentence("Sam", -42.1, "$42.10")).toBe("Sam owes you $42.10");
    expect(settleSentence("Sam", 0, "$0.00")).toBe("You and Sam are settled");
  });
});
