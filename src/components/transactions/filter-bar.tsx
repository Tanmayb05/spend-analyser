"use client";

import Link from "next/link";
import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Field, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/components/app-data";
import { useParamHref } from "@/components/dashboard/dashboard-header";
import { useBackSheet, useFilterNav } from "@/hooks/use-back-nav";
import type { TxnFilters, TxnSort } from "@/lib/analytics/filters";
import { SearchBox } from "@/components/transactions/search-box";
import { PeriodPicker, type PeriodView } from "@/components/transactions/period-picker";

const FILTER_KEYS = ["type", "cat", "sub", "core", "trip", "merchant", "pay", "by", "receipt", "plan", "q", "sched"] as const;

type Draft = {
  type: string;
  cat: string;
  sub: string;
  trip: string;
  merchant: string;
  pay: string;
  by: string;
  receipt: boolean;
  plan: boolean;
  sched: boolean;
};

const draftOf = (f: TxnFilters): Draft => ({
  type: f.type ?? "",
  cat: f.categories[0] ?? "",
  sub: f.subcategory ?? "",
  trip: f.trip ?? "",
  merchant: f.merchant ?? "",
  pay: f.payment ?? "",
  by: f.paidBy ?? "",
  receipt: f.receipt,
  plan: f.plan,
  sched: f.sched,
});

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
  const href = useParamHref();
  const go = useFilterNav();
  const more = useBackSheet<true>();
  // The sheet edits a draft; nothing is applied (or fetched) until Done. Closing the sheet discards it.
  const [draft, setDraft] = useState<Draft>(() => draftOf(filters));
  const setD = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const openMore = () => {
    setDraft(draftOf(filters));
    more.show(true);
  };
  const applyDraft = () => {
    const patch = {
      type: draft.type || null,
      cat: draft.cat || null,
      sub: draft.cat ? draft.sub || null : null,
      trip: draft.trip || null,
      merchant: draft.merchant || null,
      pay: draft.pay || null,
      by: draft.by || null,
      receipt: draft.receipt ? "1" : null,
      plan: draft.plan ? "1" : null,
      sched: draft.sched ? "1" : null,
    };
    if (href(patch) === href({})) return more.hide(); // nothing changed: just close
    // the sheet's history entry becomes the filtered page, so Done is one Back step
    more.handOff();
    go(patch, { replace: true });
  };

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

  const kind = draft.type === "income" ? "income" : "expense";

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
          <button type="button" onClick={openMore} aria-label={filterCount ? `Filters, ${filterCount} active` : "Filters"} className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-surface-2 text-sm hover:text-text sm:w-auto sm:px-4">
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

      <Sheet open={more.open} onClose={more.hide} title="More filters">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={draft.type} onChange={(e) => setD({ type: e.target.value, cat: "", sub: "" })}>
                <option value="">All types</option>
                <option value="expense">Expenses</option>
                <option value="income">Income</option>
                <option value="refund">Refunds</option>
              </Select>
            </Field>
            <Field label="Category">
              <Select value={draft.cat} onChange={(e) => setD({ cat: e.target.value, sub: "" })}>
                <option value="">All categories</option>
                {app.categories.filter((c) => !draft.type || c.kind === kind).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          {draft.cat ? (
            <Field label="Subcategory">
              <Select value={draft.sub} onChange={(e) => setD({ sub: e.target.value })}>
                <option value="">Any</option>
                {app.subcategories.filter((s) => s.category_id === draft.cat).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Trip" hint="Filtering by a trip shows its expenses even when the trip isn't counted in spending.">
            <Select value={draft.trip} onChange={(e) => setD({ trip: e.target.value })}>
              <option value="">Any</option>
              {app.trips.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Merchant">
            <Select value={draft.merchant} onChange={(e) => setD({ merchant: e.target.value })}>
              <option value="">Any</option>
              {app.merchants.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment">
              <Select value={draft.pay} onChange={(e) => setD({ pay: e.target.value })}>
                <option value="">Any</option>
                {app.paymentMethods.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Paid by">
              <Select value={draft.by} onChange={(e) => setD({ by: e.target.value })}>
                <option value="">Anyone</option>
                {app.people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={draft.receipt} onChange={(e) => setD({ receipt: e.target.checked })} className="h-5 w-5 accent-[var(--accent)]" />
            Has a receipt
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={draft.plan} onChange={(e) => setD({ plan: e.target.checked })} className="h-5 w-5 accent-[var(--accent)]" />
            Spread / EMI only
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={draft.sched} onChange={(e) => setD({ sched: e.target.checked })} className="mt-0.5 h-5 w-5 accent-[var(--accent)]" />
            <span>
              Include scheduled in totals
              <span className="block text-xs text-muted">Future-dated entries are left out of totals until they happen. Turn on to see projected totals.</span>
            </span>
          </label>
          <Button className="w-full" onClick={applyDraft}>Done</Button>
        </div>
      </Sheet>
    </div>
  );
}
