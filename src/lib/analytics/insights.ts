import type { LedgerRow } from "@/lib/data/types";
import { addMonths, daysInMonth, monthStart, type ISODate } from "@/lib/dates";
import { formatMoney, formatPercent } from "@/lib/money";
import type { MonthTotals } from "./summary";
import { byCategory, countable } from "./summary";
import type { BudgetTotals, ResolvedBudget } from "./budgets";

export type InsightTone = "good" | "warn" | "bad" | "neutral";
export type Insight = { id: string; tone: InsightTone; text: string; priority: number };

type Input = {
  rows: LedgerRow[]; // ledger rows covering at least month-3 .. month
  series: MonthTotals[]; // monthly totals including `month`
  month: ISODate;
  today: ISODate;
  budgets: Map<string, ResolvedBudget>;
  totals: BudgetTotals;
  categoryName: (id: string) => string;
  currency: string;
};

/** Plain-language, deterministic insights (free, no AI). Highest priority first. */
export function ruleInsights(input: Input, limit = 3): Insight[] {
  const { rows, series, month, today, budgets, totals, categoryName, currency } = input;
  const m = monthStart(month);
  const money = (n: number) => formatMoney(n, currency, { whole: Math.abs(n) >= 100 });
  const out: Insight[] = [];
  const cur = series.find((s) => s.month === m);
  const prev = series.find((s) => s.month === addMonths(m, -1));
  const isCurrent = m === monthStart(today);

  // 1. category above its 3-month average
  const now = byCategory(rows, m, today);
  const prior = [1, 2, 3].map((i) => byCategory(rows, addMonths(m, -i), today));
  for (const c of now) {
    const avg = prior.reduce((a, list) => a + (list.find((x) => x.categoryId === c.categoryId)?.spent ?? 0), 0) / 3;
    if (avg >= 20 && c.spent > avg * 1.2 && c.spent - avg >= 20) {
      const ratio = c.spent / avg;
      out.push({
        id: `cat-up-${c.categoryId}`,
        tone: "warn",
        priority: 60 + Math.min(15, (c.spent - avg) / 50),
        text:
          ratio >= 2
            ? `${categoryName(c.categoryId)} is ${ratio.toFixed(1)}× your 3-month average (${money(c.spent)} vs ${money(avg)}).`
            : `${categoryName(c.categoryId)} is ${formatPercent(ratio - 1)} above your 3-month average (${money(c.spent)} vs ${money(avg)}).`,
      });
    }
  }

  // 2. a single expense > 25% of its category budget
  const monthRows = countable(rows.filter((r) => r.month === m && r.type === "expense"), m, today);
  const biggest = [...monthRows].sort((a, b) => Number(b.amount) - Number(a.amount))[0];
  if (biggest) {
    const b = budgets.get(biggest.category_id)?.amount ?? 0;
    if (b > 0 && Number(biggest.amount) > b * 0.25) {
      const label = biggest.merchant_name || biggest.description || categoryName(biggest.category_id);
      out.push({
        id: "big-expense",
        tone: "neutral",
        priority: 50,
        text: `Biggest single expense: ${label} at ${money(Number(biggest.amount))}, ${formatPercent(Number(biggest.amount) / b)} of the ${categoryName(biggest.category_id)} budget.`,
      });
    }
  }

  // 3. savings rate change
  if (cur?.savingsRate != null && prev?.savingsRate != null) {
    const delta = cur.savingsRate - prev.savingsRate;
    if (Math.abs(delta) >= 0.1) {
      out.push({
        id: "savings-rate",
        tone: delta > 0 ? "good" : "warn",
        priority: 55,
        text: `Savings rate ${delta > 0 ? "rose" : "fell"} from ${formatPercent(prev.savingsRate)} to ${formatPercent(cur.savingsRate)} vs last month.`,
      });
    }
  }

  // 4. core pace vs core budget (current month only)
  if (isCurrent && cur && totals.core > 0) {
    const day = Number(today.slice(8, 10));
    const projected = (cur.core / Math.max(day, 1)) * daysInMonth(m);
    if (day >= 5 && projected > totals.core * 1.05) {
      out.push({
        id: "core-pace",
        tone: "bad",
        priority: 80,
        text: `At this pace, core spending ends the month near ${money(projected)}, over the ${money(totals.core)} core budget.`,
      });
    } else if (day >= 10 && projected <= totals.core) {
      out.push({ id: "core-pace-ok", tone: "good", priority: 30, text: `Core spending is on pace to stay within its ${money(totals.core)} budget.` });
    }
  }

  // 5. EMI / spread finishing this month
  const finishing = rows.filter((r) => r.month === m && r.installment_seq != null && r.installment_seq === r.installment_count && !r.is_lump);
  if (finishing.length) {
    const freed = finishing.reduce((a, r) => a + Number(r.amount), 0);
    out.push({
      id: "emi-ends",
      tone: "good",
      priority: 45,
      text: `${finishing.length === 1 ? `${finishing[0].merchant_name || finishing[0].description || "A plan"} finishes` : `${finishing.length} plans finish`} this month, freeing about ${money(freed)}/month.`,
    });
  }

  // 6. new merchant with meaningful spend
  const seen = new Set(rows.filter((r) => r.month < m && r.month >= addMonths(m, -3) && r.merchant_id).map((r) => r.merchant_id));
  const newSpend = new Map<string, { name: string; spent: number }>();
  for (const r of monthRows) {
    if (!r.merchant_id || seen.has(r.merchant_id)) continue;
    const e = newSpend.get(r.merchant_id) ?? { name: r.merchant_name ?? "", spent: 0 };
    e.spent += Number(r.spend);
    newSpend.set(r.merchant_id, e);
  }
  const topNew = [...newSpend.values()].sort((a, b) => b.spent - a.spent)[0];
  if (topNew && topNew.spent >= 50) {
    out.push({ id: "new-merchant", tone: "neutral", priority: 35, text: `New this month: ${topNew.name} (${money(topNew.spent)}).` });
  }

  // 7. income vs target
  if (cur && totals.incomeTarget > 0 && !isCurrent && cur.income < totals.incomeTarget * 0.9) {
    out.push({
      id: "income-target",
      tone: "warn",
      priority: 40,
      text: `Income was ${money(cur.income)}, below your ${money(totals.incomeTarget)} target.`,
    });
  }

  // fallback: biggest controllable category
  const topCore = byCategory(rows, m, today, "core")[0];
  if (topCore && cur && cur.spent > 0) {
    out.push({
      id: "top-core",
      tone: "neutral",
      priority: 10,
      text: `${categoryName(topCore.categoryId)} is your biggest controllable cost this month (${money(topCore.spent)}, ${formatPercent(topCore.spent / cur.spent)} of spending).`,
    });
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, limit);
}
