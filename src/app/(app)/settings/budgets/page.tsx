import { SettingsPage } from "@/components/settings/section";
import { BudgetsEditor } from "@/components/settings/budgets-editor";
import { getReferenceData } from "@/lib/data/reference";
import { getLedger } from "@/lib/data/ledger";
import { addMonths, isValidMonthParam, monthEnd, monthStart } from "@/lib/dates";
import { byCategory } from "@/lib/analytics/summary";
import { HELP } from "@/lib/help";

export const metadata = { title: "Budgets" };

export default async function BudgetsPage({ searchParams }: PageProps<"/settings/budgets">) {
  const sp = await searchParams;
  const ref = await getReferenceData();
  const month = isValidMonthParam(sp.m as string) ? `${sp.m}-01` : monthStart(ref.today);
  const rows = await getLedger(ref.profile.dashboard_mode, addMonths(month, -1), monthEnd(month));

  const toMap = (m: string) => {
    const out: Record<string, number> = {};
    for (const c of byCategory(rows, m, ref.today)) out[c.categoryId] = c.spent;
    // income categories: sum income
    for (const r of rows.filter((x) => x.month === m && x.type === "income" && !x.is_scheduled)) out[r.category_id] = (out[r.category_id] ?? 0) + Number(r.income);
    return out;
  };

  return (
    <SettingsPage title="Budgets" info={HELP.budgets} description="Set how much you plan to spend per category each month. Income categories take an income target.">
      <BudgetsEditor
        key={month}
        month={month}
        categories={ref.categories}
        budgets={ref.budgets}
        actual={toMap(month)}
        lastActual={toMap(addMonths(month, -1))}
        currency={ref.profile.base_currency}
      />
    </SettingsPage>
  );
}
