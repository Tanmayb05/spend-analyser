"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { Field, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/components/app-data";
import { useParamHref } from "@/components/dashboard/dashboard-header";
import { cn } from "@/lib/utils";
import type { TxnFilters } from "@/lib/analytics/filters";
import type { LedgerMode } from "@/lib/data/types";
import { MODE_HINT, MODE_OPTIONS } from "@/lib/labels";
import { SearchBox } from "@/components/transactions/search-box";
import { PeriodPicker, type PeriodView } from "@/components/transactions/period-picker";

/** Pill with its caption inside ("Type  All types ▾") so every control in the row is the same height and reads on its own. */
function InlineField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="flex h-10 shrink-0 items-center rounded-full border border-border bg-surface-2 pl-4 text-sm focus-within:border-accent"
    >
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

const INLINE_SELECT = "h-full w-auto min-w-0 rounded-full border-0 bg-transparent py-0 pl-2 pr-8 text-sm focus:ring-0";

const FILTER_KEYS = ["type", "cat", "sub", "core", "trip", "merchant", "pay", "by", "receipt", "plan", "q"] as const;

export function FilterBar({
  view,
  month,
  year,
  today,
  mode,
  filters,
  descriptions,
}: {
  view: PeriodView;
  month: string;
  year: number;
  today: string;
  mode: LedgerMode;
  filters: TxnFilters;
  descriptions: string[];
}) {
  const app = useAppData();
  const router = useRouter();
  const href = useParamHref();
  const typeId = useId();
  const catId = useId();
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
  ].filter(Boolean);

  const kind = filters.type === "income" ? "income" : "expense";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker view={view} month={month} year={year} today={today} />
        <button
          type="button"
          aria-pressed={filters.core}
          onClick={() => go({ core: filters.core ? null : "1" })}
          className={cn("h-11 shrink-0 rounded-full border px-4 text-sm", filters.core ? "border-text bg-text text-bg" : "border-border bg-surface-2 text-muted hover:text-text")}
        >
          Everyday only
        </button>
        <SearchBox value={filters.q} descriptions={descriptions} go={go} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2" title={MODE_HINT[mode]}>
          <span className="pl-1 text-xs font-medium uppercase tracking-wide text-muted">Accounting</span>
          <Segmented size="sm" ariaLabel="Accounting mode" value={mode} onChange={(v) => go({ mode: v })} options={MODE_OPTIONS} className="h-10 items-center" />
        </div>
        <InlineField label="Type" htmlFor={typeId}>
          <Select id={typeId} value={filters.type ?? ""} onChange={(e) => go({ type: e.target.value || null, cat: null, sub: null })} className={INLINE_SELECT}>
            <option value="">All types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
            <option value="refund">Refunds</option>
          </Select>
        </InlineField>
        <InlineField label="Category" htmlFor={catId}>
          <Select id={catId} value={filters.categories[0] ?? ""} onChange={(e) => go({ cat: e.target.value || null, sub: null })} className={INLINE_SELECT}>
            <option value="">All categories</option>
            {app.categories.filter((c) => !filters.type || c.kind === kind).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </InlineField>
        <button type="button" onClick={() => setMore(true)} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-surface-2 px-4 text-sm text-muted">
          <SlidersHorizontal size={14} /> More filters
        </button>
      </div>

      {chips.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips}
          <Link href={href(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))} scroll={false} className="text-xs text-muted hover:text-text">Clear all</Link>
        </div>
      ) : null}

      <Sheet open={more} onClose={() => setMore(false)} title="More filters">
        <div className="space-y-3">
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
          <Button className="w-full" onClick={() => setMore(false)}>Done</Button>
        </div>
      </Sheet>
    </div>
  );
}
