import { Card, Insight } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { TrendBars } from "@/components/charts/trend-bars";
import { SERIES, categoryColor } from "@/components/charts/colors";
import { FilterBar } from "@/components/transactions/filter-bar";
import { TxnList } from "@/components/transactions/txn-list";
import { AddFirst } from "@/components/dashboard/add-first";
import { getReferenceData } from "@/lib/data/reference";
import { getLedger, parseMode } from "@/lib/data/ledger";
import { addMonths, formatMonth, isValidMonthParam, monthEnd, monthStart } from "@/lib/dates";
import { formatMoney, formatPercent, pctChange } from "@/lib/money";
import { activeFilterCount, applyFilters, breakdown, metric, parseFilters } from "@/lib/analytics/filters";
import { lastMonths } from "@/lib/analytics/summary";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { InfoTitle } from "@/components/ui/info-title";
import { HELP } from "@/lib/help";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const sp = await searchParams;
  const ref = await getReferenceData();
  const currency = ref.profile.base_currency;
  const month = isValidMonthParam(sp.m as string) ? `${sp.m}-01` : monthStart(ref.today);
  const mode = parseMode(sp.mode, ref.profile.dashboard_mode);
  const filters = parseFilters(sp);
  const months = lastMonths(month, 12);

  const all = await getLedger(mode, months[0], monthEnd(month), Boolean(filters.trip));
  const catName = (id: string) => ref.categories.find((c) => c.id === id)?.name ?? "";
  const subName = (id: string | null) => (id ? ref.subcategories.find((s) => s.id === id)?.name ?? "" : "");
  const filtered = applyFilters(all, filters, (r) => `${catName(r.category_id)} ${subName(r.subcategory_id)}`);

  const monthRows = filtered.filter((r) => r.month === month);
  const total = metric(monthRows, filters);
  const series = months.map((m) => ({ month: m, a: metric(filtered.filter((r) => r.month === m), filters) }));
  const prev = series.find((s) => s.month === addMonths(month, -1))?.a ?? 0;
  const prior3 = series.filter((s) => s.month < month).slice(-3);
  const avg3 = prior3.length === 3 ? prior3.reduce((a, s) => a + s.a, 0) / 3 : null;
  const firstIdx = series.findIndex((s) => s.a !== 0);
  const active = firstIdx < 0 ? [] : series.slice(firstIdx);
  const avg12 = active.length ? active.reduce((a, s) => a + s.a, 0) / active.length : 0;
  const vsPrev = pctChange(total, prev);
  const vsAvg = avg3 != null ? pctChange(total, avg3) : null;
  const incomeView = filters.type === "income";

  const qsFor = (patch: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    for (const [k, v] of Object.entries(patch)) p.set(k, v);
    return `?${p}`;
  };

  const bySub = filters.categories.length === 1 ? breakdown(monthRows, (r) => r.subcategory_id, filters) : breakdown(monthRows, (r) => r.category_id, filters);
  const byMerchant = breakdown(monthRows, (r) => r.merchant_id, filters);
  const label = activeFilterCount(filters) ? "Filtered total" : incomeView ? "Income" : "Spent";
  const money = (n: number) => formatMoney(n, currency, { whole: Math.abs(n) >= 1000 });

  return (
    <>
      <div className="mb-5">
        <InfoTitle as="h1" info={HELP.transactions} className="text-3xl font-medium sm:text-4xl" panelClassName="max-w-xl">Transactions</InfoTitle>
      </div>
      <FilterBar month={month} mode={mode} filters={filters} />

      <section className="mt-4 grid items-start gap-4 xl:grid-cols-[380px_1fr]">
          <Card className="order-1 xl:col-start-1 xl:row-start-1">
            <InfoTitle as="p" info={HELP.filteredTotal} className="text-xs font-medium uppercase tracking-wide text-muted">{label} · {formatMonth(month)}</InfoTitle>
            <p className="num mt-2 text-5xl font-medium">{formatMoney(total, currency, { whole: true })}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Delta label="vs last month" value={vsPrev} goodWhenUp={incomeView} />
              <Delta label="vs 3-mo avg" value={vsAvg} goodWhenUp={incomeView} />
            </div>
            <div className="mt-6">
              <TrendBars
                data={series.map((s) => ({ ...s, href: qsFor({ m: s.month.slice(0, 7) }) }))}
                selected={month}
                currency={currency}
                aLabel={incomeView ? "Income" : "Spent"}
                aColor={incomeView ? SERIES.income : SERIES.spent}
                height={140}
              />
            </div>
            <Insight>
              {avg12 > 0
                ? `Over ${active.length === 1 ? "1 month" : `${active.length} months`} this averages ${money(avg12)}/month. ${formatMonth(month, "long")} is ${total >= avg12 ? "above" : "below"} average by ${money(Math.abs(total - avg12))}.`
                : "No history for this filter yet."}
            </Insight>
          </Card>

        <div className="order-3 space-y-4 xl:col-start-1 xl:row-start-2">
          {bySub.length ? (
            <Card>
              <p className="mb-3 text-sm font-medium">{filters.categories.length === 1 ? "By subcategory" : "By category"}</p>
              <Breakdown
                items={bySub.map((b) => {
                  const c = ref.categories.find((x) => x.id === b.key);
                  return { label: filters.categories.length === 1 ? subName(b.key) || "—" : c?.name ?? "—", value: b.value, color: categoryColor(filters.categories.length === 1 ? ref.categories.find((x) => x.id === filters.categories[0]) : c), href: qsFor(filters.categories.length === 1 ? { sub: b.key } : { cat: b.key }) };
                })}
                total={total}
                currency={currency}
              />
            </Card>
          ) : null}

          {byMerchant.length ? (
            <Card>
              <p className="mb-3 text-sm font-medium">Top merchants</p>
              <Breakdown
                items={byMerchant.map((b) => ({ label: ref.merchants.find((m) => m.id === b.key)?.name ?? "—", value: b.value, color: "var(--c1)", href: qsFor({ merchant: b.key }) }))}
                total={total}
                currency={currency}
              />
            </Card>
          ) : null}
        </div>

        <Card className="order-2 min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1">
          {monthRows.length ? (
            <TxnList rows={monthRows} />
          ) : all.length === 0 && !activeFilterCount(filters) ? (
            <EmptyState title="No transactions yet" body="Add one, or import your spreadsheet." action={<AddFirst />} />
          ) : (
            <EmptyState title="Nothing matches" body="Try another month or clear some filters." />
          )}
        </Card>
      </section>
    </>
  );
}

function Delta({ label, value, goodWhenUp }: { label: string; value: number | null; goodWhenUp: boolean }) {
  if (value == null || !Number.isFinite(value)) return <span className="rounded-full bg-surface-3 px-2.5 py-1 text-muted">– {label}</span>;
  const up = value > 0;
  const good = value === 0 ? null : up === goodWhenUp;
  return (
    <span className={cn("rounded-full px-2.5 py-1 font-medium", good === null ? "bg-surface-3 text-muted" : good ? "bg-good/15 text-good" : "bg-bad/15 text-bad")}>
      {up ? "▲" : "▼"} {formatPercent(Math.abs(value))} {label}
    </span>
  );
}

function Breakdown({ items, total, currency }: { items: { label: string; value: number; color: string; href: string }[]; total: number; currency: string }) {
  const max = Math.max(...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.label}>
          <Link href={i.href} scroll={false} className="block">
            <div className="flex justify-between gap-3 text-sm">
              <span className="truncate">{i.label}</span>
              <span className="num shrink-0 text-muted">
                <span className="text-text">{formatMoney(i.value, currency, { whole: true })}</span> · {formatPercent(total ? i.value / total : 0)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full" style={{ width: `${(i.value / max) * 100}%`, background: i.color }} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
