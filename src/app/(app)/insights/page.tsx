import Link from "next/link";
import { Card, CardHeader, Insight } from "@/components/ui/card";
import { TrendBars } from "@/components/charts/trend-bars";
import { SERIES } from "@/components/charts/colors";
import { AnalysisPanel } from "@/components/insights/analysis-panel";
import { AskCard } from "@/components/insights/ask-card";
import { pickAskExamples } from "@/lib/ai/ask-examples";
import { FlagsCard, type FlagView } from "@/components/insights/flags-card";
import { getReferenceData } from "@/lib/data/reference";
import { getLedger } from "@/lib/data/ledger";
import { requireUser } from "@/lib/supabase/server";
import { getAiUsage } from "@/lib/ai/usage";
import { buildAnalysisInput } from "@/lib/ai/aggregates";
import { formatMoney } from "@/lib/money";
import { addMonths, formatMonth, isValidMonthParam, monthEnd, monthStart } from "@/lib/dates";
import { budgetTotals, budgetsForMonth } from "@/lib/analytics/budgets";
import { lastMonths, monthlySeries } from "@/lib/analytics/summary";
import { ruleInsights } from "@/lib/analytics/insights";
import { cn } from "@/lib/utils";
import type { Analysis } from "@/lib/ai/schemas";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { InsightTabs } from "@/components/insights/insight-tabs";
import { INSIGHT_INTRO, parseInsightTab } from "@/components/insights/tabs";
import { CategoryMovers } from "@/components/insights/category-movers";
import { BudgetGauges } from "@/components/insights/budget-gauges";
import { HabitStats, MerchantsCard, RecurringCard, RhythmCard } from "@/components/insights/habit-cards";
import { categoryColor } from "@/components/charts/colors";
import { PeriodPicker } from "@/components/transactions/period-picker";
import { ForecastCard } from "@/components/insights/forecast-card";
import { CompareSwitch } from "@/components/insights/compare-switch";
import { StatStrip } from "@/components/cards/stat-strip";
import { categoryMovers, compareLabel, compareTotals, forecastMonth, merchantRows, parseCompareBase, recurringCharges, spendingRhythm } from "@/lib/analytics/insight-views";
import { formatPercent } from "@/lib/money";
import { HELP } from "@/lib/help";

export const metadata = { title: "Insights" };
const TONE = { good: "bg-good", warn: "bg-warn", bad: "bg-bad", neutral: "bg-faint" } as const;

export default async function InsightsPage({ searchParams }: PageProps<"/insights">) {
  const sp = await searchParams;
  const ref = await getReferenceData();
  const month = isValidMonthParam(sp.m as string) ? `${sp.m}-01` : monthStart(ref.today);
  const scopeName = sp.scope === "quarter" || sp.scope === "year" ? sp.scope : "month";
  const scope = { scope: scopeName, month } as const;
  const scopeKey = `${scopeName}|${month}`;
  const tab = parseInsightTab(sp.tab);
  const vs = parseCompareBase(sp.vs);

  const { supabase } = await requireUser();
  const rows = await getLedger(addMonths(month, -14), monthEnd(addMonths(month, 3)));

  // the AI tab's data (cached analysis, usage, flags) is only fetched when that tab is open
  let ai: { cachedRow: { result: unknown; scope: unknown; created_at: string } | null; usage: Awaited<ReturnType<typeof getAiUsage>>; flags: FlagView[]; stale: boolean } | null = null;
  if (tab === "ai") {
    const [usage, cachedRow, flagRows] = await Promise.all([
      getAiUsage(),
      supabase.from("ai_insights").select("result, scope, created_at").eq("scope_key", scopeKey).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("ai_flags").select("id, kind, reason, transaction_id").eq("dismissed", false).order("created_at", { ascending: false }).limit(20),
    ]);
    const flagTxns = flagRows.data?.length
      ? ((await supabase.from("transactions").select("id, date, amount, currency, description, merchants(name)").in("id", flagRows.data.map((f) => f.transaction_id))).data ?? [])
      : [];
    const flags: FlagView[] = (flagRows.data ?? []).flatMap((f) => {
      const t = flagTxns.find((x) => x.id === f.transaction_id);
      if (!t) return [];
      const label = (t.merchants as { name: string } | null)?.name || t.description || "Transaction";
      return [{ id: f.id, kind: f.kind as FlagView["kind"], reason: f.reason, date: t.date, label, amount: Number(t.amount), currency: t.currency, href: `/transactions?${new URLSearchParams({ m: t.date.slice(0, 7), q: label })}` }];
    });
    let stale = false;
    if (cachedRow.data && ref.aiReady) {
      const { fingerprint } = await buildAnalysisInput(scope);
      stale = (cachedRow.data.scope as { fingerprint?: string })?.fingerprint !== fingerprint;
    }
    ai = { cachedRow: cachedRow.data, usage, flags, stale };
  }

  const resolved = budgetsForMonth(ref.budgets, ref.categories, month);
  const series = monthlySeries(rows, lastMonths(month, 13), ref.today);
  const currency = ref.profile.base_currency;
  const thisMonth = monthStart(ref.today);
  const trend = lastMonths(month, 12).map((m) => {
    const t = series.find((x) => x.month === m)!;
    return { month: m, a: t.spent, b: t.income, href: `?${new URLSearchParams({ m: m.slice(0, 7), scope: scopeName })}` };
  });
  const activeMonths = trend.filter((t) => t.month <= thisMonth && (t.a > 0 || t.b > 0));
  const overMonths = activeMonths.filter((t) => t.a > t.b).length;
  const avgSpend = activeMonths.length ? activeMonths.reduce((a, t) => a + t.a, 0) / activeMonths.length : 0;
  const rules = ruleInsights(
    {
      rows,
      series,
      month,
      today: ref.today,
      budgets: resolved,
      totals: budgetTotals(resolved, ref.categories),
      categoryName: (id) => ref.categories.find((c) => c.id === id)?.name ?? "Other",
      currency,
    },
    6,
  );

  const link = (patch: Record<string, string>) => {
    const q = new URLSearchParams({ m: month.slice(0, 7), ...(tab !== "overview" ? { tab } : {}), ...(tab === "ai" ? { scope: scopeName } : {}), ...(tab === "categories" && vs !== "avg" ? { vs } : {}), ...patch });
    return `?${q}`;
  };
  const txnHref = (patch: Record<string, string>) => `/transactions?${new URLSearchParams({ m: month.slice(0, 7), ...patch })}`;

  // Categories and Habits tabs: computed from the same ledger, nothing extra to fetch
  const catName = (id: string) => ref.categories.find((c) => c.id === id)?.name ?? "Other";
  const movers = tab === "categories" ? categoryMovers(rows, month, ref.today, resolved, vs) : [];
  const moverViews = movers.map((c) => ({
    ...c,
    name: catName(c.categoryId),
    color: categoryColor(ref.categories.find((x) => x.id === c.categoryId)),
    href: txnHref({ cat: c.categoryId }),
  }));
  const baseLabel = compareLabel(month, vs);
  const cmp = tab === "categories" ? compareTotals(rows, month, ref.today, vs) : null;
  const diff = (c: number | null, goodWhenDown: boolean) => {
    if (c == null) return { note: `No ${baseLabel === "usual" ? "history" : baseLabel} to compare with` } as const;
    const up = c >= 0;
    const tone = Math.abs(c) < 0.05 ? undefined : up === goodWhenDown ? ("bad" as const) : ("good" as const);
    return { note: `${up ? "+" : "−"}${formatPercent(Math.abs(c))} vs ${baseLabel}`, noteTone: tone };
  };
  const forecast = tab === "overview" ? forecastMonth(rows, month, ref.today, budgetTotals(resolved, ref.categories).total) : null;

  const merchants = tab === "habits" ? merchantRows(rows, month, ref.today, 8).map((m) => ({ ...m, href: txnHref({ merchant: m.merchantId }) })) : [];
  const recurring = tab === "habits" ? recurringCharges(rows, month, ref.today).map((r) => ({ ...r, href: txnHref({ merchant: r.merchantId }) })) : [];
  const rhythm = tab === "habits" ? spendingRhythm(rows, month, ref.today) : null;

  return (
    <>
      <DashboardHeader title="Insights" info={HELP.insights}>
        <InsightTabs tab={tab} />
      </DashboardHeader>
      <p className="-mt-2 mb-4 max-w-2xl text-sm text-muted">{INSIGHT_INTRO[tab]}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <PeriodPicker view="month" month={month} year={Number(month.slice(0, 4))} today={ref.today} monthOnly />
        {tab === "categories" ? <CompareSwitch value={vs} /> : null}
        {tab === "ai" ? (
          <div className="inline-flex rounded-control border border-border bg-surface-2 p-1">
            {(["month", "quarter", "year"] as const).map((sc) => (
              <Link key={sc} href={link({ scope: sc })} className={cn("rounded-[calc(var(--radius-control)-4px)] px-3.5 py-1.5 text-sm font-medium transition-colors duration-(--dur-fast)", scopeName === sc ? "bg-surface-3 text-text ring-1 ring-inset ring-text/10" : "text-muted hover:text-text")}>
                {sc === "month" ? "This month" : sc === "quarter" ? "3 months" : "12 months"}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        {tab === "overview" ? (
          <>
            {forecast ? <ForecastCard f={forecast} currency={currency} info={HELP.forecast} /> : null}
            <Card>
              <CardHeader title="Am I spending more than I earn?" subtitle="Last 12 months · spent vs income" info={HELP.trend} />
              <TrendBars data={trend} selected={month} currency={currency} aLabel="Spent" bLabel="Income" aColor={SERIES.spent} bColor={SERIES.income} height={200} />
              <Insight>
                {activeMonths.length > 1
                  ? `You spent more than you earned in ${overMonths} of the last ${activeMonths.length} months. Average spend: ${formatMoney(avgSpend, currency, { whole: true })}/month.`
                  : activeMonths.length
                    ? `${overMonths ? "You spent more than you earned" : "You earned more than you spent"} this month.`
                    : "Not enough history yet."}
              </Insight>
            </Card>
            <Card>
              <CardHeader title="Quick insights" subtitle="Automatic checks, free and always up to date" info={HELP.quickInsights} />
              <ul className="divide-y divide-border">
                {rules.map((i) => (
                  <li key={i.id} className="flex gap-3 py-3 text-sm leading-relaxed first:pt-0 last:pb-0">
                    <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", TONE[i.tone])} aria-hidden />
                    {i.text}
                  </li>
                ))}
                {!rules.length ? <li className="text-sm text-muted">Nothing unusual this month</li> : null}
              </ul>
            </Card>
          </>
        ) : null}

        {tab === "categories" && cmp ? (
          <>
            <StatStrip
              stats={[
                { label: "Spent", value: formatMoney(cmp.spent.now, currency, { whole: true }), ...diff(cmp.spent.change, true) },
                { label: "Income", value: formatMoney(cmp.income.now, currency, { whole: true }), ...diff(cmp.income.change, false) },
                { label: "Saved", value: formatMoney(cmp.saved.now, currency, { whole: true }), ...diff(cmp.saved.change, false) },
                { label: vs === "avg" ? "3-month average spend" : `Spent ${baseLabel}`, value: formatMoney(cmp.spent.base, currency, { whole: true }) },
              ]}
            />
            <BudgetGauges items={moverViews} currency={currency} subtitle={`How much of each monthly budget is used in ${formatMonth(month)}`} />
            <CategoryMovers
              items={moverViews}
              currency={currency}
              info={HELP.categoryMovers}
              baseLabel={baseLabel}
            />
          </>
        ) : null}

        {tab === "habits" && rhythm ? (
          <>
            <HabitStats rhythm={rhythm} currency={currency} />
            <div className="grid items-start gap-4 xl:grid-cols-2">
              <MerchantsCard items={merchants} currency={currency} info={HELP.merchantsInsight} />
              <div className="min-w-0 space-y-4">
                <RecurringCard items={recurring} currency={currency} info={HELP.recurring} />
                <RhythmCard rhythm={rhythm} currency={currency} info={HELP.rhythm} />
              </div>
            </div>
          </>
        ) : null}

        {tab === "ai" && ai ? (
          <>
            <AnalysisPanel
              key={scopeKey}
              scope={scope}
              cached={(ai.cachedRow?.result as Analysis | undefined) ?? null}
              stale={ai.stale}
              generatedAt={ai.cachedRow?.created_at ?? null}
              left={ai.usage.analysis.left}
              limit={ai.usage.analysis.limit}
              ready={ref.aiReady}
            />
            <AskCard ready={ref.aiReady} left={ai.usage.chat.left} limit={ai.usage.chat.limit} info={HELP.ask} examples={pickAskExamples(5)} />
            {ref.aiReady || ai.flags.length ? <FlagsCard flags={ai.flags} ready={ref.aiReady} left={ai.usage.organize.left} info={HELP.flags} /> : null}
          </>
        ) : null}
      </div>
    </>
  );
}
