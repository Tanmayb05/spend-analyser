import { describe, expect, it } from "vitest";
import { budgetStatus, budgetTotals, budgetsForMonth, resolveBudget } from "@/lib/analytics/budgets";
import type { Budget, Category } from "@/lib/data/types";

const b = (category_id: string, effective_month: string, amount: number) => ({ id: effective_month, user_id: "u", category_id, effective_month, amount }) as Budget;
const budgets = [b("g", "2026-01-01", 150), b("g", "2026-10-01", 200), b("g", "2026-12-01", 250)];

describe("budget carry-forward", () => {
  it("uses latest effective month <= month", () => {
    expect(resolveBudget(budgets, "g", "2025-12-01").amount).toBe(0);
    expect(resolveBudget(budgets, "g", "2026-05-14").amount).toBe(150);
    expect(resolveBudget(budgets, "g", "2026-11-01")).toEqual({ categoryId: "g", amount: 200, since: "2026-10-01" });
    expect(resolveBudget(budgets, "g", "2027-03-01").amount).toBe(250);
  });
  it("totals split core / non-core / income", () => {
    const cats = [
      { id: "g", kind: "expense", is_core: true, archived: false },
      { id: "r", kind: "expense", is_core: false, archived: false },
      { id: "i", kind: "income", is_core: false, archived: false },
    ] as Category[];
    const resolved = budgetsForMonth([...budgets, b("r", "2026-01-01", 600), b("i", "2026-01-01", 900)], cats, "2026-11-01");
    expect(budgetTotals(resolved, cats)).toEqual({ total: 800, core: 200, incomeTarget: 900 });
  });
  it("status thresholds", () => {
    expect(budgetStatus(50, 100)).toBe("ok");
    expect(budgetStatus(80, 100)).toBe("near");
    expect(budgetStatus(101, 100)).toBe("over");
    expect(budgetStatus(0, 0)).toBe("none");
    expect(budgetStatus(5, 0)).toBe("over");
  });
});
