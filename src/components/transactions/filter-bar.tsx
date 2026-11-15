"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Field, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/components/app-data";
import { useParamHref } from "@/components/dashboard/dashboard-header";
import type { TxnFilters, TxnSort } from "@/lib/analytics/filters";
import { SearchBox } from "@/components/transactions/search-box";
import { PeriodPicker, type PeriodView } from "@/components/transactions/period-picker";

const FILTER_KEYS = ["type", "cat", "sub", "core", "trip", "merchant", "pay", "by", "receipt", "plan", "q", "sched"] as const;

export function FilterBar({
  view,
  month,
  year,
  today,
  filters,
  descriptions,
  sort,
}: {
  view: PeriodView;
  month: string;
  year: number;
  today: string;
  filters: TxnFilters;
  descriptions: string[];
  sort: TxnSort;
}) {
  const app = useAppData();
  const router = useRouter();
  const href = useParamHref();
  const [more, setMore] = useState(false);
  const go = (patch: Record<string, string | null>) => router.push(href(patch), { scroll: false });

  const chip = (label: string, clear: Record<string, null>) => (
    <button key={label} type="button" onClick={() => go(clear)} className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent">
      {label} <X size={12} />
    </button>
  );
  const chips = [
    filters.type && chip(filters.type[0].toUpperCase() + filters.type.slice(1), { type: null }),
    ...filters.categories.map((id) =>
      chip(app.maps.category.get(id)?.name ?? "Category", { cat: null }),
    ),
    filters.subcategory && chip(app.maps.subcategory.get(filters.subcategory)?.name ?? "Subcategory", { sub: null }),
    filters.core && chip("Everyday only", { core: null }),
    filters.trip && chip(app.maps.trip.get(filters.trip)?.name ?? "Trip", { trip: null }),
    filters.merchant && chip(app.merchants.find((m) => m.id === filters.merchant)?.name ?? "Merchant", { merchant: null }),
    filters.payment && chip(app.maps.payment.get(filters.payment)?.name ?? "Payment", { pay: null }),
    filters.paidBy && chip(`Paid by ${app.maps.person.get(filters.paidBy)?.name ?? "?"}`, { by: null }),
    filters.receipt && chip("Has receipt", { receipt: null }),
    filters.plan && chip("Spread / EMI", { plan: null }),
    filters.sched && chip("Incl. scheduled", { sched: null }),
  ].filter(Boolean);
  const filterCount = chips.length;

  const kind = filters.type === "income" ? "income" : "expense";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker view={view} month={month} year={year} today={today} />
        <SearchBox value={filters.q} descriptions={descriptions} go={go} />
      </div>

      {/* one line on phones (toggle · Filters · Sort, chips drop below); on sm+ chips sit beside the toggle and Filters/Sort stay right */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-3">
        <Segmented
          ariaLabel="Activity view"
          className="shrink-0 max-sm:[&_button]:px-2.5 max-sm:[&_button]:text-xs"
          value={filters.core ? "core" : "all"}
          onChange={(v) => go({ core: v === "core" ? "1" : null })}
          options={[{ value: "all", label: "All activity" }, { value: "core", label: "Everyday" }]}
        />
        {chips.length ? (
          <div className="order-last flex w-full flex-wrap items-center gap-2 sm:order-none sm:w-auto sm:min-w-0" aria-label="Active filters">
            {chips}
            <Link href={href(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))} scroll={false} className="text-xs text-muted hover:text-text">Clear all</Link>
          </div>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <button type="button" onClick={() => setMore(true)} aria-label={filterCount ? `Filters, ${filterCount} active` : "Filters"} className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-surface-2 text-sm hover:text-text sm:w-auto sm:px-4">
            <SlidersHorizontal size={16} />
            <span className="max-sm:sr-only">Filters</span>
            {filterCount ? (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-xs font-medium text-white max-sm:absolute max-sm:-right-1 max-sm:-top-1" aria-hidden>{filterCount}</span>
            ) : null}
          </button>
          <Select aria-label="Sort" value={sort} onChange={(e) => go({ sort: e.target.value === "newest" ? null : e.target.value })} className="h-11 w-auto rounded-full py-0 pl-3 pr-8 text-xs sm:pl-4 sm:pr-9 sm:text-sm">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="largest">Largest first</option>
          </Select>
        </div>
      </div>

      <Sheet open={more} onClose={() => setMore(false)} title="More filters">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={filters.type ?? ""} onChange={(e) => go({ type: e.target.value || null, cat: null, sub: null })}>
                <option value="">All types</option>
                <option value="expense">Expenses</option>
                <option value="income">Income</option>
                <option value="refund">Refunds</option>
              </Select>
            </Field>
            <Field label="Category">
              <Select value={filters.categories[0] ?? ""} onChange={(e) => go({ cat: e.target.value || null, sub: null })}>
                <option value="">All categories</option>
                {app.categories.filter((c) => !filters.type || c.kind === kind).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          {filters.categories[0] ? (
            <Field label="Subcategory">
              <Select value={filters.subcategory ?? ""} onChange={(e) => go({ sub: e.target.value || null })}>
                <option value="">Any</option>
                {app.subcategories.filter((s) => s.category_id === filters.categories[0]).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Trip" hint="Filtering by a trip shows its expenses even when the trip isn't counted in spending.">
            <Select value={filters.trip ?? ""} onChange={(e) => go({ trip: e.target.value || null })}>
              <option value="">Any</option>
              {app.trips.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Merchant">
            <Select value={filters.merchant ?? ""} onChange={(e) => go({ merchant: e.target.value || null })}>
              <option value="">Any</option>
              {app.merchants.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment">
              <Select value={filters.payment ?? ""} onChange={(e) => go({ pay: e.target.value || null })}>
                <option value="">Any</option>
                {app.paymentMethods.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Paid by">
              <Select value={filters.paidBy ?? ""} onChange={(e) => go({ by: e.target.value || null })}>
                <option value="">Anyone</option>
                {app.people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={filters.receipt} onChange={(e) => go({ receipt: e.target.checked ? "1" : null })} className="h-5 w-5 accent-[var(--accent)]" />
            Has a receipt
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={filters.plan} onChange={(e) => go({ plan: e.target.checked ? "1" : null })} className="h-5 w-5 accent-[var(--accent)]" />
            Spread / EMI only
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={filters.sched} onChange={(e) => go({ sched: e.target.checked ? "1" : null })} className="mt-0.5 h-5 w-5 accent-[var(--accent)]" />
            <span>
              Include scheduled in totals
              <span className="block text-xs text-muted">Future-dated entries are left out of totals until they happen. Turn on to see projected totals.</span>
            </span>
          </label>
          <Button className="w-full" onClick={() => setMore(false)}>Done</Button>
        </div>
      </Sheet>
    </div>
  );
}
