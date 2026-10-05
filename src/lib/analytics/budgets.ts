import type { Budget, Category } from "@/lib/data/types";
import { monthStart, type ISODate } from "@/lib/dates";
import { round2 } from "@/lib/utils";

export type ResolvedBudget = { categoryId: string; amount: number; since: ISODate | null };

/** Budget for one category in a month: the latest row with effective_month <= month (carry-forward). */
export function resolveBudget(budgets: Budget[], categoryId: string, month: ISODate): ResolvedBudget {
  const m = monthStart(month);
  let best: Budget | null = null;
  for (const b of budgets) {
    if (b.category_id !== categoryId || b.effective_month > m) continue;
    if (!best || b.effective_month > best.effective_month) best = b;
  }
  return { categoryId, amount: best ? Number(best.amount) : 0, since: best?.effective_month ?? null };
}

export function budgetsForMonth(budgets: Budget[], categories: Category[], month: ISODate): Map<string, ResolvedBudget> {
  return new Map(categories.map((c) => [c.id, resolveBudget(budgets, c.id, month)]));
}

export type BudgetTotals = { total: number; core: number; incomeTarget: number };

export function budgetTotals(resolved: Map<string, ResolvedBudget>, categories: Category[]): BudgetTotals {
  let total = 0;
  let core = 0;
  let incomeTarget = 0;
  for (const c of categories) {
    if (c.archived) continue;
    const a = resolved.get(c.id)?.amount ?? 0;
    if (c.kind === "income") incomeTarget += a;
    else {
      total += a;
      if (c.is_core) core += a;
    }
  }
  return { total: round2(total), core: round2(core), incomeTarget: round2(incomeTarget) };
}

export type BudgetStatus = "over" | "near" | "ok" | "none";

/** Over (>100%), Near limit (>=80%), On track; "none" when no budget is set. */
export function budgetStatus(spent: number, budget: number): BudgetStatus {
  if (!(budget > 0)) return spent > 0 ? "over" : "none";
  const r = spent / budget;
  if (r > 1) return "over";
  if (r >= 0.8) return "near";
  return "ok";
}
