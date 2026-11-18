import { describe, expect, it, vi } from "vitest";
import type { Category, Subcategory } from "@/lib/data/types";
import { buildFinanceTools, MAX_RANGE_MONTHS, rangeOf } from "@/lib/ai/tools";
import { row } from "../fixtures";

const cats = [{ id: "food", name: "Food", kind: "expense" }, { id: "rent", name: "Rent", kind: "expense" }, { id: "pay", name: "Salary", kind: "income" }] as Category[];
const subs = [{ id: "groc", category_id: "food", name: "Groceries" }] as Subcategory[];

const ledgerRows = [
  row({ entry_date: "2026-09-03", amount: 50, category_id: "food", subcategory_id: "groc", merchant_name: "Kroger", description: "weekly shop" }),
  row({ entry_date: "2026-10-05", amount: 70, category_id: "food", merchant_name: "Kroger" }),
  row({ entry_date: "2026-10-06", amount: 30, category_id: "food", merchant_name: "Chipotle", description: "lunch" }),
  row({ entry_date: "2026-10-01", amount: 1000, category_id: "rent", merchant_name: "Landlord" }),
  row({ entry_date: "2026-10-15", amount: 3000, type: "income", category_id: "pay" }),
  row({ entry_date: "2026-11-30", amount: 999, category_id: "food", merchant_name: "Future", is_scheduled: true }),
];

function setup() {
  const ledger = vi.fn(async (from: string, to: string) => ledgerRows.filter((r) => r.entry_date >= from && r.entry_date <= to));
  const tools = buildFinanceTools({ ledger, categories: cats, subcategories: subs, today: "2026-11-18" });
  // tools are called with (input, options); options are unused here
  const call = <K extends keyof typeof tools>(name: K, input: Parameters<NonNullable<(typeof tools)[K]["execute"]>>[0]) =>
    (tools[name].execute as (i: unknown, o: unknown) => Promise<unknown>)(input, { toolCallId: "x", messages: [] });
  return { ledger, call };
}

describe("rangeOf", () => {
  it("orders months, uses full-month bounds, caps the span", () => {
    expect(rangeOf("2026-10", "2026-09")).toMatchObject({ from: "2026-09-01", to: "2026-10-31" });
    expect(rangeOf("2024-02", "2024-02").to).toBe("2024-02-29");
    const r = rangeOf("2000-01", "2026-12");
    expect(r.months.from).toBe("2024-01");
    expect(MAX_RANGE_MONTHS).toBe(36);
  });
});

describe("finance tools", () => {
  it("monthly_totals sums spend and income per month, posted only", async () => {
    const { call } = setup();
    expect(await call("monthly_totals", { from_month: "2026-09", to_month: "2026-11" })).toEqual([
      { month: "2026-09", spent: 50, income: 0, net: -50 },
      { month: "2026-10", spent: 1100, income: 3000, net: 1900 },
    ]);
  });

  it("category_breakdown ranks categories with shares and subcategories", async () => {
    const { call } = setup();
    const r = (await call("category_breakdown", { from_month: "2026-09", to_month: "2026-10", kind: "expense" })) as { total: number; categories: Array<{ category: string; total: number; share: number; subcategories: unknown[] }> };
    expect(r.total).toBe(1150);
    expect(r.categories[0]).toMatchObject({ category: "Rent", total: 1000 });
    expect(r.categories[1]).toMatchObject({ category: "Food", total: 150, subcategories: [{ name: "Groceries", total: 50 }] });
  });

  it("top_merchants filters by category and rejects unknown ones with a hint", async () => {
    const { call } = setup();
    expect(await call("top_merchants", { from_month: "2026-10", to_month: "2026-10", category: "food", limit: 5 })).toEqual([
      { merchant: "Kroger", total: 70, count: 1 },
      { merchant: "Chipotle", total: 30, count: 1 },
    ]);
    expect(await call("top_merchants", { from_month: "2026-10", to_month: "2026-10", category: "Pets", limit: 5 })).toMatchObject({ error: expect.stringContaining("Use one of: Food, Rent, Salary") });
  });

  it("find_transactions matches text, min amount and skips future rows", async () => {
    const { call } = setup();
    const r = (await call("find_transactions", { from_month: "2026-09", to_month: "2026-11", text: "kroger", category: null, min_amount: 60, kind: "expense" })) as { count: number; rows: Array<{ merchant: string }> };
    expect(r.count).toBe(1);
    expect(r.rows[0].merchant).toBe("Kroger");
    const all = (await call("find_transactions", { from_month: "2026-11", to_month: "2026-11", text: null, category: null, min_amount: null, kind: "expense" })) as { count: number };
    expect(all.count).toBe(0); // the scheduled $999 hasn't happened
  });

  it("reuses one ledger read per range within a question", async () => {
    const { call, ledger } = setup();
    await call("monthly_totals", { from_month: "2026-10", to_month: "2026-10" });
    await call("top_merchants", { from_month: "2026-10", to_month: "2026-10", category: null, limit: 3 });
    expect(ledger).toHaveBeenCalledTimes(1);
  });
});
