import { Card, Insight } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { TrendBars } from "@/components/charts/trend-bars";
import { MODE_COLOR, SERIES, categoryColor } from "@/components/charts/colors";
import { FilterBar } from "@/components/transactions/filter-bar";
import { TxnList } from "@/components/transactions/txn-list";
import { Breakdown } from "@/components/transactions/breakdown";
import { PeriodKpiStrip } from "@/components/transactions/period-kpis";
import { SpendDonut } from "@/components/dashboard/spend-donut";
import { AddFirst } from "@/components/dashboard/add-first";
import { getReferenceData } from "@/lib/data/reference";
import { getLedger, getTransactionLinks, parseMode } from "@/lib/data/ledger";
import { addMonths, formatMonth, isValidMonthParam, isValidYearParam, monthStart, yearEnd } from "@/lib/dates";
import { formatMoney, pctChange } from "@/lib/money";
import { activeFilterCount, applyFilters, breakdown, metric, parseFilters } from "@/lib/analytics/filters";
import { foldOther, periodKpis, rowsInMonths, yearSeries } from "@/lib/analytics/period";
import { InfoTitle } from "@/components/ui/info-title";
import { HELP } from "@/lib/help";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const sp = await searchParams;
  const ref = await getReferenceData();
  const currency = ref.profile.base_currency;
  const today = ref.today;

  // `view=year&y=YYYY` is the Year view; anything else (including every pre-existing link) is the Month view.
  const view = sp.view === "year" ? "year" : "month";
  const month = isValidMonthParam(sp.m as string) ? `${sp.m}-01` : monthStart(today);
  const year = view === "year" && isValidYearParam(sp.y as string) ? Number(sp.y) : Number(month.slice(0, 4));
  const mode = parseMode(sp.mode, ref.profile.dashboard_mode);
  const filters = parseFilters(sp);

  // One fetch covers the Jan–Dec chart plus what the deltas need (prior year for Year view, prior Oct–Dec for Month view).
  const from = view === "year" ? `${year - 1}-01-01` : `${year - 1}-10-01`;
  const all = await getLedger(mode, from, yearEnd(year), Boolean(filters.trip));

  const catName = (id: string) => ref.categories.find((c) => c.id === id)?.name ?? "";
  const subName = (id: string | null) => (id ? ref.subcategories.find((s) => s.id === id)?.name ?? "" : "");
  const extraText = (r: (typeof all)[number]) => `${catName(r.category_id)} ${subName(r.subcategory_id)}`;
  const filtered = applyFilters(all, filters, extraText);
  // Totals (spend / income / saved) ignore the type filter so income and spend always sit side by side.
  const totalsBase = applyFilters(all, { ...filters, type: null }, extraText);

  // distinct descriptions (most recent first, capped) feed the search suggestions
  const descriptions = [...new Set(
    [...all].sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1)).flatMap((r) => (r.description?.trim() ? [r.description.trim()] : [])),
  )].slice(0, 300);

  const series = yearSeries(filtered, year, filters, today);
  const incomeView = filters.type === "income";
  const money = (n: number) => formatMoney(n, currency, { whole: Math.abs(n) >= 1000 });

  // current period vs previous period
  const periodFrom = view === "year" ? `${year}-01-01` : month;
  const periodTo = view === "year" ? `${year}-12-01` : month;
  const prevFrom = view === "year" ? `${year - 1}-01-01` : addMonths(month, -1);
  const prevTo = view === "year" ? `${year - 1}-12-01` : addMonths(month, -1);
  const periodRows = rowsInMonths(filtered, periodFrom, periodTo);
  const total = metric(periodRows, filters);

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
  const catItems = breakdown(periodRows, (r) => (oneCategory ? r.subcategory_id : r.category_id), filters, 1000);
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
  const byMerchant = breakdown(periodRows, (r) => r.merchant_id, filters, view === "year" ? 8 : 5);
  const periodLabel = view === "year" ? String(year) : formatMonth(month);

  const monthRows = view === "month" ? periodRows : [];
  const transactionLinks = view === "month" ? await getTransactionLinks(monthRows.map((r) => r.txn_id)) : new Map<string, string | null>();
  const displayRows = monthRows.map((r) => ({ ...r, external_url: r.txn_id ? transactionLinks.get(r.txn_id) ?? null : null }));

  const summaryCard = (
    <PeriodKpiStrip kpis={kpis} currency={currency} period={periodLabel} deltas={deltas}>
      <TrendBars
        data={series.map((s) => ({ ...s, href: qsFor({ view: null, y: null, m: s.month.slice(0, 7) }) }))}
        selected={view === "month" ? month : ""}
        currency={currency}
        aLabel={incomeView ? "Income" : "Spent"}
        aColor={incomeView ? SERIES.income : MODE_COLOR[mode]}
        height={140}
        confirmSelect
      />
      <Insight>
        {avgMonth > 0
          ? view === "year"
            ? `${year} averages ${money(avgMonth)}/month over ${active.length === 1 ? "1 month" : `${active.length} months`}${peak ? `; ${formatMonth(peak.month, "short")} was highest at ${money(peak.a)}` : ""}.`
            : `Over ${active.length === 1 ? "1 month" : `${active.length} months`} this year it averages ${money(avgMonth)}/month. ${formatMonth(month, "long")} is ${total >= avgMonth ? "above" : "below"} average by ${money(Math.abs(total - avgMonth))}.`
          : "No history for this filter yet."}
      </Insight>
    </PeriodKpiStrip>
  );

  const categoriesCard = slices.length ? (
    <Card>
      <p className="mb-3 text-sm font-medium">{oneCategory ? "By subcategory" : "By category"}</p>
      <SpendDonut slices={slices} currency={currency} totalLabel={incomeView ? "Total income" : "Total spent"} showBudget={false} />
    </Card>
  ) : null;

  const merchantsCard = byMerchant.length ? (
    <Card>
      <p className="mb-3 text-sm font-medium">Top merchants</p>
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
      <div className="mb-5">
        <InfoTitle as="h1" info={HELP.transactions} className="text-3xl font-medium sm:text-4xl" panelClassName="max-w-xl">Transactions</InfoTitle>
      </div>
      <FilterBar view={view} month={month} year={year} today={today} mode={mode} filters={filters} descriptions={descriptions} />

      {view === "year" ? (
        <section className="mt-4 space-y-4">
          {noData ? (
            <Card>
              <EmptyState title="No transactions yet" body="Add one, or import your spreadsheet." action={<AddFirst />} />
            </Card>
          ) : (
            <>
              {summaryCard}
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
            </>
          )}
        </section>
      ) : (
        <section className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            {summaryCard}
            {categoriesCard}
            {merchantsCard}
          </div>

          <Card className="min-w-0">
            {monthRows.length ? (
              <TxnList rows={displayRows} />
            ) : noData ? (
              <EmptyState title="No transactions yet" body="Add one, or import your spreadsheet." action={<AddFirst />} />
            ) : (
              <EmptyState title="Nothing matches" body="Try another month or clear some filters." />
            )}
          </Card>
        </section>
      )}
    </>
  );
}
