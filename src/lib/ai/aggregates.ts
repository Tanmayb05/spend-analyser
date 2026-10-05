import "server-only";
import { createHash } from "node:crypto";
import { getReferenceData } from "@/lib/data/reference";
import { getLedger } from "@/lib/data/ledger";
import { requireUser } from "@/lib/supabase/server";
import { addMonths, monthEnd } from "@/lib/dates";
import { budgetTotals, budgetsForMonth } from "@/lib/analytics/budgets";
import { byCategory, lastMonths, monthlySeries } from "@/lib/analytics/summary";
import { round2 } from "@/lib/utils";
import type { AnalysisScope } from "@/app/(app)/ai/actions";

const SPAN = { month: 1, quarter: 3, year: 12 } as const;

/** Compact, aggregate-only snapshot sent to Gemini (no individual transactions or notes). */
export async function buildAnalysisInput(scope: AnalysisScope) {
  const ref = await getReferenceData();
  const span = SPAN[scope.scope];
  const contextMonths = Math.max(span * 2, 6);
  const months = lastMonths(scope.month, contextMonths);
  const rows = await getLedger(scope.mode, months[0], monthEnd(addMonths(scope.month, 3)));
  const series = monthlySeries(rows, months, ref.today);
  const focus = months.slice(-span);
  const catName = (id: string) => ref.categories.find((c) => c.id === id)?.name ?? "Other";

  const categories = ref.categories
    .filter((c) => c.kind === "expense")
    .map((c) => {
      const perMonth: Record<string, number> = {};
      for (const m of months) perMonth[m.slice(0, 7)] = byCategory(rows, m, ref.today).find((x) => x.categoryId === c.id)?.spent ?? 0;
      return { name: c.name, core: c.is_core, budget: budgetsForMonth(ref.budgets, [c], scope.month).get(c.id)?.amount ?? 0, perMonth };
    })
    .filter((c) => Object.values(c.perMonth).some((v) => v !== 0) || c.budget > 0);

  const merchants = new Map<string, { total: number; count: number }>();
  for (const r of rows.filter((x) => focus.includes(x.month) && x.merchant_name && !x.is_scheduled && x.type !== "income")) {
    const m = merchants.get(r.merchant_name!) ?? { total: 0, count: 0 };
    m.total = round2(m.total + Number(r.spend));
    m.count += 1;
    merchants.set(r.merchant_name!, m);
  }

  const future = [1, 2, 3].map((i) => {
    const m = addMonths(ref.today.slice(0, 7) + "-01", i);
    return { month: m.slice(0, 7), committed: round2(rows.filter((r) => r.month === m).reduce((a, r) => a + Number(r.spend), 0)) };
  });

  const { supabase } = await requireUser();
  const { data: items } = await supabase
    .from("receipt_items")
    .select("normalized_name, unit_price, total_price, quantity, purchased_at")
    .gte("purchased_at", months[0])
    .not("normalized_name", "is", null)
    .order("purchased_at")
    .limit(2000);
  const byItem = new Map<string, { first: number; last: number; times: number; spent: number }>();
  for (const i of items ?? []) {
    const price = Number(i.unit_price ?? (i.quantity ? Number(i.total_price) / Number(i.quantity) : i.total_price));
    const e = byItem.get(i.normalized_name!) ?? { first: price, last: price, times: 0, spent: 0 };
    e.last = price;
    e.times += 1;
    e.spent = round2(e.spent + Number(i.total_price));
    byItem.set(i.normalized_name!, e);
  }

  const payload = {
    period: { scope: scope.scope, from: focus[0].slice(0, 7), to: scope.month.slice(0, 7), mode: scope.mode, today: ref.today },
    months: series.map((s) => ({ month: s.month.slice(0, 7), spent: s.spent, income: s.income, net: s.net, core: s.core, inFocus: focus.includes(s.month) })),
    budgets: budgetTotals(budgetsForMonth(ref.budgets, ref.categories, scope.month), ref.categories),
    categories,
    topMerchants: [...merchants.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 10).map(([name, v]) => ({ name, ...v })),
    committedNextMonths: future,
    trips: ref.trips.filter((t) => t.include_mode === "excluded").map((t) => t.name).slice(0, 5),
    items: [...byItem.entries()]
      .filter(([, v]) => v.times >= 2)
      .sort((a, b) => b[1].spent - a[1].spent)
      .slice(0, 15)
      .map(([name, v]) => ({ name, times: v.times, firstPrice: round2(v.first), lastPrice: round2(v.last), spent: v.spent })),
    biggestCategoryThisPeriod: catName(byCategory(rows, scope.month, ref.today)[0]?.categoryId ?? ""),
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(payload.months) + JSON.stringify(payload.categories)).digest("hex").slice(0, 16);
  return { payload, fingerprint, currency: ref.profile.base_currency };
}
