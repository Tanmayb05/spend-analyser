import { Card, Insight } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { TrendBars } from "@/components/charts/trend-bars";
import { SERIES, categoryColor } from "@/components/charts/colors";
import { FilterBar } from "@/components/transactions/filter-bar";
import { TxnList } from "@/components/transactions/txn-list";
import { Breakdown } from "@/components/transactions/breakdown";
import { IncomeKpiStrip, PeriodKpiStrip } from "@/components/transactions/period-kpis";
import { YearHeatmap } from "@/components/dashboard/year-heatmap";
import { SpendDonut } from "@/components/dashboard/spend-donut";
import { TxnTabs } from "@/components/transactions/txn-tabs";
import { TabIntro, parseTxnTab } from "@/components/transactions/tab-intro";
import { PlansView } from "@/components/plans/plans-view";
import { CardsView } from "@/components/cards/cards-view";
import { AddFirst } from "@/components/dashboard/add-first";
import { getReferenceData } from "@/lib/data/reference";
import { getLedger, getTransactionExtras } from "@/lib/data/ledger";
import { addMonths, formatMonth, isValidMonthParam, isValidYearParam, monthStart, yearEnd } from "@/lib/dates";
import { formatMoney, pctChange } from "@/lib/money";
import { activeFilterCount, applyFilters, breakdown, metric, parseFilters, parseSort } from "@/lib/analytics/filters";
import { foldOther, periodKpis, postedRows, rowsInMonths, yearSeries } from "@/lib/analytics/period";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { HELP } from "@/lib/help";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const sp = await searchParams;
  const ref = await getReferenceData();
  const currency = ref.profile.base_currency;
  const today = ref.today;

  // Activity (the ledger), Plans (paid-upfront spreads), EMIs (installment purchases) or Credit cards (balances and bills).
  // Old `?tab=plans&pk=emi` links resolve to the EMIs tab.
  const tab = parseTxnTab(sp.tab, sp.pk);
  if (tab !== "activity") {
    return (
      <>
        <DashboardHeader title="Transactions" info={tab === "cards" ? HELP.cards : tab === "emis" ? HELP.emis : HELP.plans} addTransaction>
          <TxnTabs tab={tab} />
        </DashboardHeader>
        <TabIntro tab={tab} />
        {tab === "cards" ? <CardsView /> : <PlansView kind={tab === "emis" ? "emi" : "spread"} />}
      </>
    );
  }

  // `view=year&y=YYYY` is the Year view; anything else (including every pre-existing link) is the Month view.
  const view = sp.view === "year" ? "year" : "month";
  const month = isValidMonthParam(sp.m as string) ? `${sp.m}-01` : monthStart(today);
  const year = view === "year" && isValidYearParam(sp.y as string) ? Number(sp.y) : Number(month.slice(0, 4));
  const filters = parseFilters(sp);
  const sort = parseSort(sp);

  // One fetch covers the Jan–Dec chart plus what the deltas need (prior year for Year view, prior Oct–Dec for Month view).
  const from = view === "year" ? `${year - 1}-01-01` : `${year - 1}-10-01`;
  const all = await getLedger(from, yearEnd(year), Boolean(filters.trip));

  const catName = (id: string) => ref.categories.find((c) => c.id === id)?.name ?? "";
  const subName = (id: string | null) => (id ? ref.subcategories.find((s) => s.id === id)?.name ?? "" : "");
  const extraText = (r: (typeof all)[number]) => `${catName(r.category_id)} ${subName(r.subcategory_id)}`;
  const matched = applyFilters(all, filters, extraText);
  // Totals (spend / income / saved) ignore the type filter so income and spend always sit side by side.
  const totalsMatched = applyFilters(all, { ...filters, type: null }, extraText);
  // Totals, charts and breakdowns count posted entries only; scheduled (future-dated) ones join with "Include scheduled".
  const filtered = filters.sched ? matched : postedRows(matched, today);
  const totalsBase = filters.sched ? totalsMatched : postedRows(totalsMatched, today);

  // distinct descriptions (most recent first, capped) feed the search suggestions
  const descriptions = [...new Set(
    [...all].sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1)).flatMap((r) => (r.description?.trim() ? [r.description.trim()] : [])),
  )].slice(0, 300);

  // Income view: Type = Income, or filtering by income categories (or a subcategory of one). Only then do the charts and totals track income.
  const pickedCats = filters.categories.length
    ? filters.categories
    : filters.subcategory
      ? [ref.subcategories.find((s) => s.id === filters.subcategory)?.category_id ?? ""]
      : [];
  const incomeView =
    filters.type === "income" ||
    (!filters.type && pickedCats.length > 0 && pickedCats.every((id) => ref.categories.find((c) => c.id === id)?.kind === "income"));
  // metric() / breakdown() read the filters' type to decide between income and spend
  const viewFilters = incomeView ? { ...filters, type: "income" as const } : filters;
  const series = yearSeries(filtered, year, viewFilters, today);
  const money = (n: number) => formatMoney(n, currency, { whole: Math.abs(n) >= 1000 });

  // current period vs previous period
  const periodFrom = view === "year" ? `${year}-01-01` : month;
  const periodTo = view === "year" ? `${year}-12-01` : month;
  const prevFrom = view === "year" ? `${year - 1}-01-01` : addMonths(month, -1);
  const prevTo = view === "year" ? `${year - 1}-12-01` : addMonths(month, -1);
  const periodRows = rowsInMonths(filtered, periodFrom, periodTo);
  const total = metric(periodRows, viewFilters);

  const kpis = periodKpis(rowsInMonths(totalsBase, periodFrom, periodTo));
  const prevKpis = periodKpis(rowsInMonths(totalsBase, prevFrom, prevTo));
  const prevLabel = view === "year" ? "vs last year" : "vs last month";
  const deltas = {
    spend: { value: pctChange(kpis.spend, prevKpis.spend), label: prevLabel },
    income: { value: pctChange(kpis.income, prevKpis.income), label: prevLabel },
    saved: { value: prevKpis.saved > 0 ? pctChange(kpis.saved, prevKpis.saved) : null, label: prevLabel },
  };

  // months that have started, from the first month with data: what "average per month" means
  const elapsed = series.filter((s) => !s.future);
  const firstIdx = elapsed.findIndex((s) => s.a !== 0);
  const active = firstIdx < 0 ? [] : elapsed.slice(firstIdx);
  const avgMonth = active.length ? active.reduce((a, s) => a + s.a, 0) / active.length : 0;
  const peak = active.reduce<(typeof active)[number] | null>((best, s) => (!best || s.a > best.a ? s : best), null);

  const qsFor = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    return `?${p}`;
  };

  const oneCategory = filters.categories.length === 1;
  const catItems = breakdown(periodRows, (r) => (oneCategory ? r.subcategory_id : r.category_id), viewFilters, 1000);
  const slices = foldOther(catItems, 6).map((b) => {
    if (b.key === "other") return { key: "other", label: "Other", value: b.value, color: "var(--c-other)" };
    const cat = ref.categories.find((x) => x.id === b.key);
    const parent = oneCategory ? ref.categories.find((x) => x.id === filters.categories[0]) : cat;
    return {
      key: b.key,
      label: oneCategory ? subName(b.key) || "—" : cat?.name ?? "—",
      value: b.value,
      color: categoryColor(parent),
      href: qsFor(oneCategory ? { sub: b.key } : { cat: b.key }),
    };
  });
  const byMerchant = breakdown(periodRows, (r) => r.merchant_id, viewFilters, view === "year" ? 8 : 5);
  const periodLabel = view === "year" ? String(year) : formatMonth(month);

  // the list shows everything that matches the filters: posted rows by day, scheduled ones under "Upcoming"
  const monthAll = view === "month" ? rowsInMonths(matched, month, month) : [];
  const extras = view === "month" ? await getTransactionExtras(monthAll.map((r) => r.txn_id)) : new Map();
  const withLink = (r: (typeof all)[number]) => ({ ...r, external_url: r.txn_id ? extras.get(r.txn_id)?.external_url ?? null : null, notes: r.txn_id ? extras.get(r.txn_id)?.notes ?? null : null });
  const futureMonth = month > monthStart(today);
  const displayRows = monthAll.filter((r) => futureMonth || !r.is_scheduled).map(withLink);
  const upcomingRows = futureMonth ? [] : monthAll.filter((r) => r.is_scheduled).map(withLink);
  // label the totals when scheduled rows exist this period and the month has started
  const periodHasScheduled = !futureMonth && rowsInMonths(matched, periodFrom, periodTo).some((r) => r.is_scheduled);
  const basis = periodHasScheduled ? (filters.sched ? ("Projected" as const) : ("Actual" as const)) : undefined;

  const trendChart = (
    <>
      <TrendBars
        data={series.map((s) => ({ ...s, href: qsFor({ view: null, y: null, m: s.month.slice(0, 7) }) }))}
        selected={view === "month" ? month : ""}
        currency={currency}
        aLabel={incomeView ? "Income" : "Spent"}
        aColor={incomeView ? SERIES.income : SERIES.spent}
        height={140}
        barMaxWidth={view === "year" ? 44 : undefined}
        confirmSelect
      />
      <Insight>
        {avgMonth > 0
          ? view === "year"
            ? `${year} averages ${money(avgMonth)}/month over ${active.length === 1 ? "1 month" : `${active.length} months`}${peak ? `; ${formatMonth(peak.month, "short")} was highest at ${money(peak.a)}` : ""}.`
            : `Over ${active.length === 1 ? "1 month" : `${active.length} months`} this year it averages ${money(avgMonth)}/month. ${formatMonth(month, "long")} is ${total >= avgMonth ? "above" : "below"} average by ${money(Math.abs(total - avgMonth))}.`
          : "No history for this filter yet."}
      </Insight>
    </>
  );

  // Year view keeps the chart inside the totals card; Month view puts the entries first and the chart in the side column.
  // Income filter: income-focused totals instead of spend / income / saved
  const kpiStrip = (withChart: boolean) =>
    incomeView ? (
      <IncomeKpiStrip
        income={kpis.income}
        delta={deltas.income}
        currency={currency}
        period={periodLabel}
        avgMonth={avgMonth}
        monthsCounted={active.length}
        peak={peak ? { label: formatMonth(peak.month, "long"), value: peak.a } : null}
        basis={basis}
      >
        {withChart ? trendChart : null}
      </IncomeKpiStrip>
    ) : (
    <PeriodKpiStrip kpis={kpis} currency={currency} period={periodLabel} deltas={deltas} everyday={filters.core} basis={basis}>
      {withChart ? trendChart : null}
    </PeriodKpiStrip>
    );

  const categoriesCard = slices.length ? (
    <Card>
      <p className="card-title mb-3">{oneCategory ? "By subcategory" : "By category"}</p>
      <SpendDonut slices={slices} currency={currency} totalLabel={incomeView ? "Total income" : "Total spent"} showBudget={false} />
    </Card>
  ) : null;

  const merchantsCard = byMerchant.length ? (
    <Card>
      <p className="card-title mb-3">{incomeView ? "Top income sources" : "Top merchants"}</p>
      <Breakdown
        items={byMerchant.map((b) => ({ label: ref.merchants.find((m) => m.id === b.key)?.name ?? "—", value: b.value, color: "var(--c1)", href: qsFor({ merchant: b.key }) }))}
        total={total}
        currency={currency}
      />
    </Card>
  ) : null;

  const noData = all.length === 0 && !activeFilterCount(filters);

  return (
    <>
      <DashboardHeader title="Transactions" info={HELP.transactions} addTransaction>
        <TxnTabs tab="activity" />
      </DashboardHeader>
      <TabIntro tab="activity" />
      <FilterBar view={view} month={month} year={year} today={today} filters={filters} descriptions={descriptions} sort={sort} />

      {view === "year" ? (
        <section className="mt-4 space-y-4">
          {noData ? (
            <Card>
              <EmptyState title="No transactions yet" body="Add one, or import your spreadsheet." action={<AddFirst />} />
            </Card>
          ) : (
            <>
              {kpiStrip(true)}
              {categoriesCard || merchantsCard ? (
                <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  {categoriesCard}
                  {merchantsCard}
                </div>
              ) : (
                <Card>
                  <EmptyState title="Nothing matches" body="Try another year or clear some filters." />
                </Card>
              )}
              {/* the 12 months up to the end of this year (or today, whichever is earlier), with the filters applied; posted spending only */}
              {incomeView || !periodRows.length ? null : (
                <YearHeatmap info={HELP.yearHeatmap} rows={filtered} end={[yearEnd(year), today].sort()[0]} currency={currency} weekStart={ref.profile.week_start} />
              )}
            </>
          )}
        </section>
      ) : (
        <section className="mt-4 space-y-4">
          {noData ? null : kpiStrip(false)}
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <Card className="min-w-0">
              {monthAll.length ? (
                <TxnList rows={displayRows} upcoming={upcomingRows} sort={sort} />
              ) : noData ? (
                <EmptyState title="No transactions yet" body="Add one, or import your spreadsheet." action={<AddFirst />} />
              ) : (
                <EmptyState
                  title="Nothing matches"
                  body={filters.q ? `No transactions match “${filters.q}”. Try another month or clear some filters.` : "Try another month or clear some filters."}
                />
              )}
            </Card>
            {noData ? null : (
              <div className="min-w-0 space-y-4">
                <Card>
                  <p className="card-title mb-3">{incomeView ? "Income" : "Spent"} by month</p>
                  {trendChart}
                </Card>
                {categoriesCard}
                {merchantsCard}
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
