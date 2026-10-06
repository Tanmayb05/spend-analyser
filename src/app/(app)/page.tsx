import Link from "next/link";
import { ArrowUpRight, CalendarClock, Plane, Sparkles } from "lucide-react";
import { Card, CardHeader, Insight } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { TrendBars } from "@/components/charts/trend-bars";
import { Donut } from "@/components/charts/donut";
import { SERIES, categoryColor } from "@/components/charts/colors";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { HELP } from "@/lib/help";
import { BudgetBars, type BudgetRow } from "@/components/dashboard/budget-bars";
import { CalendarCard } from "@/components/dashboard/calendar-card";
import { AddFirst } from "@/components/dashboard/add-first";
import { LedgerList } from "@/components/transactions/ledger-list";
import { getReferenceData } from "@/lib/data/reference";
import { getLedger, parseMode } from "@/lib/data/ledger";
import { addMonths, daysInMonth, formatMonth, isValidMonthParam, monthEnd, monthStart, relativeDays } from "@/lib/dates";
import { formatMoney, formatPercent, pctChange } from "@/lib/money";
import { budgetStatus, budgetTotals, budgetsForMonth } from "@/lib/analytics/budgets";
import { byCategory, countable, daysLeft, lastMonths, monthlySeries, topWithOther, totalsFor, upcoming, type Scope } from "@/lib/analytics/summary";
import { ruleInsights } from "@/lib/analytics/insights";
import { cn } from "@/lib/utils";

export const metadata = { title: "Overview" };

const TONE_DOT = { good: "bg-good", warn: "bg-warn", bad: "bg-bad", neutral: "bg-faint" } as const;

export default async function OverviewPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const ref = await getReferenceData();
  const { today, profile, categories } = ref;
  const currency = profile.base_currency;
  const month = isValidMonthParam(sp.m as string) ? `${sp.m}-01` : monthStart(today);
  const mode = parseMode(sp.mode, profile.dashboard_mode);
  const scope: Scope = sp.scope === "core" ? "core" : "all";
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ m: month.slice(0, 7), mode, ...extra });
    return `/transactions?${p}`;
  };

  const thisMonth = monthStart(today);
  const from = addMonths(month, -14);
  const to = [monthEnd(addMonths(month, 3)), monthEnd(addMonths(thisMonth, 3))].sort().at(-1)!;
  const [rows, tripRows] = await Promise.all([
    getLedger(mode, from, to),
    getLedger(mode, month, monthEnd(month), true),
  ]);

  const catName = (id: string) => ref.categories.find((c) => c.id === id)?.name ?? "Uncategorized";
  const catById = new Map(categories.map((c) => [c.id, c]));

  // ---- totals ---------------------------------------------------------------
  const months12 = lastMonths(month, 12);
  const series = monthlySeries(rows, lastMonths(month, 13), today);
  const cur = totalsFor(rows, month, today);
  const prev = totalsFor(rows, addMonths(month, -1), today);
  const resolved = budgetsForMonth(ref.budgets, categories, month);
  const bTotals = budgetTotals(resolved, categories);
  const spentShown = scope === "core" ? cur.core : cur.spent;
  const prevShown = scope === "core" ? prev.core : prev.spent;
  const budgetShown = scope === "core" ? bTotals.core : bTotals.total;
  const isCurrent = month === thisMonth;
  const isFuture = month > thisMonth;
  const left = daysLeft(month, today);
  const remaining = budgetShown - spentShown;

  const hasData = rows.length > 0;

  // ---- trend ----------------------------------------------------------------
  const trend = months12.map((m) => {
    const t = series.find((s) => s.month === m)!;
    return { month: m, a: scope === "core" ? t.core : t.spent, b: scope === "core" ? undefined : t.income, href: `?${new URLSearchParams({ ...(sp as Record<string, string>), m: m.slice(0, 7) })}` };
  });
  const activeMonths = months12.filter((m) => m <= thisMonth).map((m) => series.find((s) => s.month === m)!).filter((t) => t.spent > 0 || t.income > 0);
  const overMonths = activeMonths.filter((t) => t.spent > t.income).length;
  const avgSpend = activeMonths.length ? activeMonths.reduce((a, t) => a + (scope === "core" ? t.core : t.spent), 0) / activeMonths.length : 0;

  // ---- categories / budgets -------------------------------------------------
  const cats = byCategory(rows, month, today, scope);
  const slices = topWithOther(cats, 5).map((c) => ({
    key: c.categoryId,
    label: c.categoryId === "other" ? "Other" : catName(c.categoryId),
    value: c.spent,
    color: c.categoryId === "other" ? "var(--c-other)" : categoryColor(catById.get(c.categoryId)),
    href: c.categoryId === "other" ? undefined : qs({ cat: c.categoryId }),
  }));
  const topCore = byCategory(rows, month, today, "core")[0];

  const budgetRows: BudgetRow[] = categories
    .filter((c) => c.kind === "expense" && !c.archived && (scope === "all" || c.is_core))
    .map((c) => {
      const spent = cats.find((x) => x.categoryId === c.id)?.spent ?? 0;
      const budget = resolved.get(c.id)?.amount ?? 0;
      return { id: c.id, name: c.name, color: categoryColor(c), spent, budget, status: budgetStatus(spent, budget), href: qs({ cat: c.id }) };
    })
    .filter((r) => r.budget > 0 || r.spent > 0)
    .sort((a, b) => {
      const rank = { over: 0, near: 1, ok: 2, none: 3 };
      return rank[a.status] - rank[b.status] || b.spent / (b.budget || 1) - a.spent / (a.budget || 1);
    });
  const overCount = budgetRows.filter((r) => r.status === "over").length;
  const nearCount = budgetRows.filter((r) => r.status === "near").length;

  // ---- upcoming + outlook ---------------------------------------------------
  const soon = upcoming(rows, today, 30);
  const nextMonth = addMonths(thisMonth, 1);
  const committedNext = rows.filter((r) => r.month === nextMonth).reduce((a, r) => a + Number(r.spend), 0);
  const outlook = [1, 2, 3].map((i) => {
    const m = addMonths(thisMonth, i);
    const committed = rows.filter((r) => r.month === m).reduce((a, r) => a + Number(r.spend), 0);
    const b = budgetTotals(budgetsForMonth(ref.budgets, categories, m), categories).total;
    return { month: m, committed, budget: b };
  });

  // ---- trips not counted ----------------------------------------------------
  const tripTotals = new Map<string, number>();
  for (const r of tripRows) {
    if (!r.trip_id) continue;
    tripTotals.set(r.trip_id, (tripTotals.get(r.trip_id) ?? 0) + Number(r.spend));
  }
  const trips = [...tripTotals.entries()].map(([id, total]) => ({ trip: ref.trips.find((t) => t.id === id)!, total })).filter((t) => t.trip);

  // ---- insights + recent ----------------------------------------------------
  const insights = ruleInsights({ rows, series, month, today, budgets: resolved, totals: bTotals, categoryName: catName, currency });
  const recent = countable(rows.filter((r) => r.month === month), month, today).slice(0, 5);
  const monthRows = rows.filter((r) => r.month === month);

  const money = (n: number) => formatMoney(n, currency, { whole: true });

  if (!hasData) {
    return (
      <>
        <DashboardHeader month={month} mode={mode} scope={scope} info={HELP.overview} />
        <EmptyState
          title="No transactions yet"
          body="Add your first expense, or import your existing Excel tracker to see your dashboard come alive."
          action={<AddFirst />}
        />
      </>
    );
  }

  return (
    <>
      <DashboardHeader month={month} mode={mode} scope={scope} info={HELP.overview} />

      {/* Row 1: KPIs */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Key numbers">
        <KpiTile
          label={scope === "core" ? "Core spent" : "Spent"}
          info={HELP.kpiSpent}
          value={money(spentShown)}
          delta={pctChange(spentShown, prevShown)}
          sub={budgetShown > 0 ? `${formatPercent(spentShown / budgetShown)} of ${money(budgetShown)}` : "No budget set"}
          progress={budgetShown > 0 ? { ratio: spentShown / budgetShown, status: budgetStatus(spentShown, budgetShown) } : undefined}
        />
        <KpiTile
          label="Income"
          info={HELP.kpiIncome}
          value={money(cur.income)}
          delta={pctChange(cur.income, prev.income)}
          goodWhenUp
          sub={bTotals.incomeTarget > 0 ? `target ${money(bTotals.incomeTarget)}` : undefined}
        />
        <KpiTile
          label="Net saved"
          info={HELP.kpiNet}
          value={formatMoney(cur.net, currency, { whole: true, signed: true })}
          tone={cur.net >= 0 ? "good" : "bad"}
          sub={cur.net < 0 ? `spent ${money(-cur.net)} more than earned` : cur.savingsRate != null ? `${formatPercent(cur.savingsRate)} of income saved` : undefined}
        />
        <KpiTile
          label="Core spend"
          info={HELP.kpiCore}
          value={money(cur.core)}
          delta={pctChange(cur.core, prev.core)}
          sub={bTotals.core > 0 ? `of ${money(bTotals.core)} core budget` : "everyday, controllable"}
          progress={bTotals.core > 0 ? { ratio: cur.core / bTotals.core, status: budgetStatus(cur.core, bTotals.core) } : undefined}
        />
        <div className="col-span-2 lg:col-span-1">
          {isCurrent ? (
            <KpiTile
              label="Left per day"
              info={HELP.kpiLeftPerDay}
              value={budgetShown > 0 ? money(Math.max(0, remaining) / Math.max(left, 1)) : "–"}
              tone={budgetShown > 0 && remaining < 0 ? "bad" : undefined}
              sub={budgetShown > 0 ? (remaining >= 0 ? `${money(remaining)} left · ${left} days` : `${money(-remaining)} over budget`) : "Set budgets in Settings"}
            />
          ) : (
            <KpiTile
              label={isFuture ? "Committed" : "Avg per day"}
              info={isFuture ? HELP.kpiCommitted : HELP.kpiAvgPerDay}
              value={isFuture ? money(spentShown) : money(spentShown / daysInMonth(month))}
              sub={isFuture ? "already scheduled" : `${cur.count} entries`}
            />
          )}
        </div>
      </section>

      {/* Row 2: trend + calendar */}
      <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader
            title={scope === "core" ? "Is my core spending steady?" : "Am I spending more than I earn?"}
            info={HELP.trend}
            subtitle={`Last 12 months · ${mode === "normalized" ? "big costs spread over months" : "actual cash out"}`}
          />
          <TrendBars
            data={trend}
            selected={month}
            currency={currency}
            aLabel={scope === "core" ? "Core spend" : "Spent"}
            bLabel={scope === "core" ? undefined : "Income"}
            aColor={SERIES.spent}
            bColor={SERIES.income}
            height={220}
          />
          <Insight>
            {scope === "core"
              ? `You average ${money(avgSpend)} a month on core spending${bTotals.core > 0 ? ` against a ${money(bTotals.core)} budget` : ""}.`
              : activeMonths.length
                ? activeMonths.length === 1
                  ? `${overMonths ? "You spent more than you earned" : "You earned more than you spent"} this month.`
                  : `You spent more than you earned in ${overMonths} of the last ${activeMonths.length} months. Average spend: ${money(avgSpend)}/month.`
                : "Not enough history yet."}
          </Insight>
        </Card>
        <CalendarCard info={HELP.calendar} month={month} today={today} rows={monthRows} currency={currency} weekStart={profile.week_start} />
      </section>

      {/* Row 3: where / budgets / upcoming */}
      <section className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title="Where did it go?" subtitle={formatMonth(month)} info={HELP.donut} />
          {slices.length ? <Donut slices={slices} currency={currency} /> : <p className="py-10 text-center text-sm text-muted">No spending this month.</p>}
          {topCore && cur.spent > 0 ? (
            <Insight>
              {catName(topCore.categoryId)} is your biggest controllable cost ({formatPercent(topCore.spent / cur.spent)} of spending).
              {scope === "all" ? " Switch to Core to hide fixed costs like rent." : ""}
            </Insight>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title="Which budgets need attention?"
            info={HELP.budgetBars}
            action={<Link href="/settings/budgets" className="text-sm text-muted hover:text-text">Edit</Link>}
          />
          {budgetRows.length ? (
            <>
              <BudgetBars rows={budgetRows.slice(0, 6)} currency={currency} />
              <Insight>
                {overCount ? `${overCount} ${overCount === 1 ? "category is" : "categories are"} over budget` : nearCount ? `${nearCount} near the limit` : "Everything is on track"}
                {budgetShown > 0 ? ` · ${money(Math.max(0, remaining))} of ${money(budgetShown)} left.` : "."}
              </Insight>
            </>
          ) : (
            <EmptyState title="No budgets yet" body="Set a monthly budget per category to see progress here." action={<Link href="/settings/budgets" className="text-sm text-accent">Set budgets →</Link>} />
          )}
        </Card>

        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader title="What's coming up?" subtitle="Next 30 days" info={HELP.upcoming} action={<CalendarClock size={18} className="text-muted" />} />
          {soon.length ? (
            <ul className="divide-y divide-border">
              {soon.slice(0, 5).map((r, i) => (
                <li key={`${r.txn_id}-${r.installment_seq}-${i}`} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.merchant_name || r.description || catName(r.category_id)}</p>
                    <p className="text-xs text-muted">
                      {relativeDays(r.entry_date, today)}
                      {r.installment_seq ? ` · ${r.installment_seq} of ${r.installment_count}` : ""}
                    </p>
                  </div>
                  <span className="num shrink-0 font-medium">{formatMoney(Number(r.amount), currency)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted">Nothing scheduled. Spread a purchase or add a future-dated expense to plan ahead.</p>
          )}
          <Insight>Already committed for {formatMonth(nextMonth)}: {money(committedNext)}.</Insight>
        </Card>
      </section>

      {/* Row 4: outlook / trips / insights / recent */}
      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Can I afford the next few months?" subtitle="Committed installments & scheduled payments vs budget" info={HELP.outlook} />
          <ul className="space-y-4">
            {outlook.map((o) => {
              const ratio = o.budget > 0 ? o.committed / o.budget : 0;
              return (
                <li key={o.month}>
                  <div className="flex justify-between text-sm">
                    <span>{formatMonth(o.month)}</span>
                    <span className="num text-muted">
                      <span className="text-text">{money(o.committed)}</span>
                      {o.budget > 0 ? ` of ${money(o.budget)}` : " committed"}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
                    <div className={cn("h-full rounded-full", ratio > 1 ? "bg-bad" : ratio > 0.8 ? "bg-warn" : "bg-accent")} style={{ width: `${Math.min(100, ratio * 100 || (o.committed > 0 ? 4 : 0))}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <Insight>
            {outlook[0].budget > 0
              ? `${money(Math.max(0, outlook[0].budget - outlook[0].committed))} of next month's budget is still free after commitments.`
              : `${money(outlook[0].committed)} is already committed next month.`}
          </Insight>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Sparkles size={18} className="text-accent" /> Insights
                </span>
              }
              info={HELP.quickInsights}
              action={
                <Link href="/insights" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
                  Deep analysis <ArrowUpRight size={14} />
                </Link>
              }
            />
            <ul className="space-y-3">
              {insights.map((i) => (
                <li key={i.id} className="flex gap-3 text-sm leading-relaxed">
                  <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", TONE_DOT[i.tone])} aria-hidden />
                  <span>{i.text}</span>
                </li>
              ))}
              {!insights.length ? <li className="text-sm text-muted">Add a few more transactions to unlock insights.</li> : null}
            </ul>
          </Card>

          {trips.length ? (
            <Card>
              <CardHeader title="Trips this month" info={HELP.tripsThisMonth} />
              <ul className="space-y-2">
                {trips.map(({ trip, total }) => (
                  <li key={trip.id}>
                    <Link href={`/trips/${trip.id}`} className="flex items-center justify-between gap-3 rounded-2xl px-2 py-2 hover:bg-surface-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <Plane size={16} className="shrink-0 text-muted" />
                        <span className="truncate">{trip.name}</span>
                        <Badge tone={trip.include_mode === "excluded" ? "neutral" : "accent"}>
                          {trip.include_mode === "excluded" ? "not counted" : trip.include_mode === "lump_sum" ? "lump sum" : "counted"}
                        </Badge>
                      </span>
                      <span className="num font-medium">{money(total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </section>

      <section className="mt-4">
        <Card>
          <CardHeader title="Recent transactions" info={HELP.recent} action={<Link href={qs({})} className="text-sm text-muted hover:text-text">View all</Link>} />
          <LedgerList rows={recent} />
        </Card>
      </section>
    </>
  );
}
