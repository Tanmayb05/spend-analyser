import Link from "next/link";
import { ArrowUpRight, CalendarClock } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { NetBars } from "@/components/charts/net-bars";
import { categoryColor } from "@/components/charts/colors";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { PeriodPicker } from "@/components/transactions/period-picker";
import { CalendarCard } from "@/components/dashboard/calendar-card";
import { SpendDonut, type AttentionItem } from "@/components/dashboard/spend-donut";
import { AddFirst } from "@/components/dashboard/add-first";
import { HELP } from "@/lib/help";
import { getReferenceData } from "@/lib/data/reference";
import { getLedger } from "@/lib/data/ledger";
import { addMonths, formatMonth, isValidMonthParam, monthEnd, monthStart, relativeDays } from "@/lib/dates";
import { formatMoney, formatPercent, pctChange } from "@/lib/money";
import { budgetStatus, budgetTotals, budgetsForMonth } from "@/lib/analytics/budgets";
import { byCategory, daysLeft, lastMonths, monthlySeries, topWithOther, totalsFor, upcoming, type Scope } from "@/lib/analytics/summary";
import { cn, round2 } from "@/lib/utils";

export const metadata = { title: "Overview" };

/**
 * Overview = three things: how am I doing (summary), when did I spend (calendar), what on (donut).
 * The month comes from `?m=` and is changed in the calendar card; scope is a global filter.
 */
export default async function OverviewPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const ref = await getReferenceData();
  const { today, profile, categories } = ref;
  const currency = profile.base_currency;
  const month = isValidMonthParam(sp.m as string) ? `${sp.m}-01` : monthStart(today);
  const scope: Scope = sp.scope === "core" ? "core" : "all";
  const qs = (extra: Record<string, string>) => `/transactions?${new URLSearchParams({ m: month.slice(0, 7), ...extra })}`;

  const thisMonth = monthStart(today);
  // 14 months back for the trend, 3 ahead for what's coming; trip rows (every trip itemized) so "not counted" trips can still show on the calendar
  const to = [monthEnd(addMonths(month, 3)), monthEnd(addMonths(thisMonth, 3))].sort().at(-1)!;
  const [rows, tripRows] = await Promise.all([
    getLedger(addMonths(month, -14), to),
    getLedger(month, monthEnd(month), true),
  ]);

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "Uncategorized";
  const catById = new Map(categories.map((c) => [c.id, c]));
  const money = (n: number) => formatMoney(n, currency, { whole: true });

  // a brand-new account (nothing anywhere) gets the empty state; any other empty month still gets the calendar
  const isNew = rows.length === 0 && tripRows.length === 0 && (await getLedger("2000-01-01", monthEnd(addMonths(thisMonth, 24)), true)).length === 0;
  if (isNew) {
    return (
      <>
        <DashboardHeader info={HELP.overview} />
        <EmptyState
          title="No transactions yet"
          body="Add your first expense, or import your existing Excel tracker to see your dashboard come alive."
          action={<AddFirst />}
        />
      </>
    );
  }

  // ---- summary: definitions unchanged; the scope switch never alters these four ------------
  const cur = totalsFor(rows, month, today);
  const prev = totalsFor(rows, addMonths(month, -1), today);
  const resolved = budgetsForMonth(ref.budgets, categories, month);
  const bTotals = budgetTotals(resolved, categories);
  const isCurrent = month === thisMonth;
  const left = daysLeft(month, today);
  const spendRemaining = bTotals.total - cur.spent;

  // ---- calendar rows: this month's counted rows + trips set to "not counted" (shown, never summed) ----
  const excludedTrips = new Set(ref.trips.filter((t) => t.include_mode === "excluded").map((t) => t.id));
  const calendarRows = [
    ...rows.filter((r) => r.month === month),
    ...tripRows.filter((r) => r.trip_id && excludedTrips.has(r.trip_id)),
  ].filter((r) => scope === "all" || r.is_core);

  // ---- donut: same rules as the summary, so its total reconciles with Total spend (All) or Core spend (Core) ----
  const cats = byCategory(rows, month, today, scope);
  const positive = cats.filter((c) => c.spent > 0);
  const slices = topWithOther(cats, 5).map((c) => {
    if (c.categoryId === "other") {
      const members = positive.slice(5).map((m) => resolved.get(m.categoryId)?.amount ?? 0).filter((b) => b > 0);
      const budget = members.length ? round2(members.reduce((a, b) => a + b, 0)) : undefined;
      return {
        key: "other",
        label: "Other",
        value: c.spent,
        color: "var(--c-other)",
        budget,
        status: budget ? budgetStatus(c.spent, budget) : undefined,
        budgetNote: budget ? `Combined budget of the ${positive.length - 5} smaller categories that have one` : undefined,
      };
    }
    const budget = resolved.get(c.categoryId)?.amount ?? 0;
    return {
      key: c.categoryId,
      label: catName(c.categoryId),
      value: c.spent,
      color: categoryColor(catById.get(c.categoryId)),
      href: qs({ cat: c.categoryId }),
      budget: budget > 0 ? budget : undefined,
      status: budget > 0 ? budgetStatus(c.spent, budget) : undefined,
    };
  });
  const shown = new Set(slices.map((s) => s.key));
  const attention: AttentionItem[] = categories
    .filter((c) => c.kind === "expense" && !c.archived && (scope === "all" || c.is_core) && !shown.has(c.id))
    .map((c) => {
      const spent = cats.find((x) => x.categoryId === c.id)?.spent ?? 0;
      const budget = resolved.get(c.id)?.amount ?? 0;
      return { c, spent, budget, status: budgetStatus(spent, budget) };
    })
    .filter((r) => r.budget > 0 && (r.status === "over" || r.status === "near"))
    .sort((a, b) => b.spent / b.budget - a.spent / a.budget)
    .slice(0, 3)
    .map((r) => ({ key: r.c.id, label: r.c.name, ratio: r.spent / r.budget, status: r.status as "over" | "near", href: qs({ cat: r.c.id }) }));
  const kpiSpend = scope === "core" ? cur.core : cur.spent;
  const unshown = round2(kpiSpend - slices.reduce((a, s) => a + s.value, 0));

  // ---- trend, upcoming, insights --------------------------------------------------------
  const months12 = lastMonths(month, 12);
  const series = monthlySeries(rows, lastMonths(month, 13), today);
  const activeMonths = months12.filter((m) => m <= thisMonth).map((m) => series.find((x) => x.month === m)!).filter((t) => t.spent > 0 || t.income > 0);
  const overMonths = activeMonths.filter((t) => t.spent > t.income).length;
  const netPoints = months12.map((m) => {
    const t = series.find((x) => x.month === m)!;
    return { month: m, net: t.income - t.spent, active: m <= thisMonth && (t.spent > 0 || t.income > 0) };
  });
  // "steady?" view: same bars as the saving card, one series (everyday spend), months with nothing planned stay empty
  const coreSpendPoints = months12.map((m) => {
    const t = series.find((x) => x.month === m)!;
    return { month: m, net: t.core, active: t.core > 0 };
  });
  const avgSpend = activeMonths.length ? activeMonths.reduce((a, t) => a + (scope === "core" ? t.core : t.spent), 0) / activeMonths.length : 0;

  const soon = upcoming(rows, today, 30);
  const nextMonth = addMonths(thisMonth, 1);
  const committedNext = rows.filter((r) => r.month === nextMonth).reduce((a, r) => a + Number(r.spend), 0);
  const nextBudget = budgetTotals(budgetsForMonth(ref.budgets, categories, nextMonth), categories).total;
  const nextRatio = nextBudget > 0 ? committedNext / nextBudget : 0;

  // rule insights and the last-month review now live in the notifications panel (src/lib/data/notifications.ts)

  return (
    <>
      <DashboardHeader info={HELP.overview} addTransaction />

      <SummaryCard
        header={
          <>
            <h2 className="card-title min-w-0">Financial summary</h2>
            {/* same picker + same ?m= param as the calendar card, so the two always show the same month */}
            <PeriodPicker view="month" month={month} year={Number(month.slice(0, 4))} today={today} monthOnly />
          </>
        }
        metrics={[
          {
            label: "Income",
            qualifier: "for this month",
            info: HELP.kpiIncome,
            value: money(cur.income),
            delta: pctChange(cur.income, prev.income),
            goodWhenUp: true,
            sub: bTotals.incomeTarget > 0 ? `of ${money(bTotals.incomeTarget)} target` : undefined,
            progress: bTotals.incomeTarget > 0 ? { ratio: cur.income / bTotals.incomeTarget, status: "ok" } : undefined,
          },
          {
            label: "Total spend",
            qualifier: "for this month",
            info: HELP.kpiSpent,
            value: money(cur.spent),
            delta: pctChange(cur.spent, prev.spent),
            sub:
              bTotals.total > 0
                ? `${formatPercent(cur.spent / bTotals.total)} of ${money(bTotals.total)}${isCurrent && spendRemaining > 0 ? ` · ${money(spendRemaining / Math.max(left, 1))}/day left` : ""}`
                : "No budget set",
            progress: bTotals.total > 0 ? { ratio: cur.spent / bTotals.total, status: budgetStatus(cur.spent, bTotals.total) } : undefined,
          },
          {
            label: "Everyday spend",
            info: HELP.kpiCore,
            value: money(cur.core),
            delta: pctChange(cur.core, prev.core),
            sub: bTotals.core > 0 ? `of ${money(bTotals.core)} everyday budget` : "controllable categories",
            progress: bTotals.core > 0 ? { ratio: cur.core / bTotals.core, status: budgetStatus(cur.core, bTotals.core) } : undefined,
          },
          {
            label: "Net savings",
            qualifier: "for this month",
            info: HELP.kpiNet,
            value: formatMoney(cur.net, currency, { whole: true, signed: true }),
            tone: cur.net > 0 ? "good" : cur.net < 0 ? "bad" : undefined,
            delta: pctChange(cur.net, prev.net),
            goodWhenUp: true,
            sub: cur.savingsRate != null ? (cur.net >= 0 ? `${formatPercent(cur.savingsRate)} of income saved` : "spent more than earned") : undefined,
          },
        ]}
      />

      <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
        {/* key: switching month remounts the card so the selected day resets */}
        <CalendarCard key={month} info={HELP.calendar} month={month} today={today} rows={calendarRows} currency={currency} weekStart={profile.week_start} scope={scope} />

        <div className="grid grid-cols-1 gap-5">
          <Card className="flex flex-col">
            <CardHeader
              title={scope === "core" ? "Everyday Spending Breakdown" : "All Spending Breakdown"}
              subtitle={scope === "core" ? "Everyday categories" : "All categories"}
              info={HELP.donut}
              action={<Link href="/settings/budgets" className="text-sm text-muted hover:text-text">Budgets</Link>}
            />
            {slices.length ? (
              <>
                <SpendDonut slices={slices} attention={attention} currency={currency} totalLabel={scope === "core" ? "Everyday spent" : "Total spent"} />
                {Math.abs(unshown) >= 0.5 ? (
                  <p className="mt-3 text-xs text-muted">
                    {scope === "core" ? "Everyday spend" : "Total spend"} is {money(kpiSpend)}; {money(Math.abs(unshown))} of net refunds isn&apos;t shown by category.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="py-10 text-center text-sm text-muted">No spending this month.</p>
            )}
          </Card>
        </div>
      </section>

      {/* second row: history and what's ahead */}
      <section className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
        <Card className="flex flex-col">
          <CardHeader
            title={scope === "core" ? "Is my everyday spending steady?" : "Am I saving?"}
            subtitle="Last 12 months"
            info={HELP.trend}
            action={
              <Link href="/insights" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
                Details <ArrowUpRight size={14} />
              </Link>
            }
          />
          <div className="flex min-h-0 flex-1 flex-col">
          {scope === "core" ? (
            <NetBars data={coreSpendPoints} selected={month} currency={currency} variant="spend" />
          ) : (
            <NetBars data={netPoints} selected={month} currency={currency} />
          )}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            {scope === "core"
              ? `Average ${money(avgSpend)} a month${bTotals.core > 0 ? ` against a ${money(bTotals.core)} budget` : ""}.`
              : activeMonths.length > 1
                ? `Average spend ${money(avgSpend)}/month · overspent ${overMonths} of ${activeMonths.length} months.`
                : activeMonths.length
                  ? `${overMonths ? "You spent more than you earned" : "You earned more than you spent"} this month.`
                  : "Not enough history yet."}
          </p>
        </Card>

        <Card>
          <CardHeader title="What's coming up?" subtitle="Next 30 days" info={HELP.upcoming} action={<CalendarClock size={18} className="text-muted" />} />
          {soon.length ? (
            <ul className="divide-y divide-border">
              {soon.slice(0, 5).map((r, i) => (
                <li key={`${r.txn_id}-${r.installment_seq}-${i}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
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
            <p className="py-4 text-center text-sm text-muted">Nothing scheduled. Spread a purchase or add a future-dated expense to plan ahead.</p>
          )}
          <div className="mt-3 border-t border-border pt-3">
            <div className="flex justify-between text-xs text-muted">
              <span>Already committed for {formatMonth(nextMonth)}</span>
              <span className="num">
                <span className="text-text">{money(committedNext)}</span>
                {nextBudget > 0 ? ` of ${money(nextBudget)}` : ""}
              </span>
            </div>
            {nextBudget > 0 ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div className={cn("h-full rounded-full", nextRatio > 1 ? "bg-bad" : nextRatio > 0.8 ? "bg-warn" : "bg-accent")} style={{ width: `${Math.min(100, nextRatio * 100 || (committedNext > 0 ? 4 : 0))}%` }} />
              </div>
            ) : null}
          </div>
        </Card>
      </section>
    </>
  );
}
