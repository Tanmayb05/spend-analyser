"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { Field, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/components/app-data";
import { useParamHref } from "@/components/dashboard/dashboard-header";
import { addMonths, formatMonth } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { TxnFilters } from "@/lib/analytics/filters";
import type { LedgerMode } from "@/lib/data/types";

export function FilterBar({ month, mode, filters }: { month: string; mode: LedgerMode; filters: TxnFilters }) {
  const app = useAppData();
  const router = useRouter();
  const href = useParamHref();
  const [q, setQ] = useState(filters.q);
  const [more, setMore] = useState(false);
  const go = (patch: Record<string, string | null>) => router.push(href(patch), { scroll: false });

  useEffect(() => {
    if (q === filters.q) return;
    const t = setTimeout(() => go({ q: q || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

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
    filters.core && chip("Core only", { core: null }),
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
        <div className="flex items-center rounded-full border border-border bg-surface-2 p-1">
          <Link href={href({ m: addMonths(month, -1).slice(0, 7) })} scroll={false} aria-label="Previous month" className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-3">
            <ChevronLeft size={18} />
          </Link>
          <label className="relative">
            <span className="block min-w-36 px-2 text-center text-sm font-medium">{formatMonth(month)}</span>
            <input type="month" aria-label="Pick month" value={month.slice(0, 7)} onChange={(e) => e.target.value && go({ m: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
          <Link href={href({ m: addMonths(month, 1).slice(0, 7) })} scroll={false} aria-label="Next month" className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-3">
            <ChevronRight size={18} />
          </Link>
        </div>
        <Segmented
          ariaLabel="View"
          value={mode}
          onChange={(v) => go({ mode: v })}
          options={[
            { value: "normalized", label: "Normalized" },
            { value: "cash", label: "Cash" },
          ]}
        />
        <div className="relative min-w-48 flex-1">
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
          <input
            aria-label="Search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search merchant or description"
            className="h-11 w-full rounded-full border border-border bg-surface-2 pl-10 pr-4 text-sm outline-none focus:border-accent"
          />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        <Select aria-label="Type" value={filters.type ?? ""} onChange={(e) => go({ type: e.target.value || null, cat: null, sub: null })} className="h-9 w-auto shrink-0 rounded-full py-0 pr-8 text-sm">
          <option value="">All types</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
          <option value="refund">Refunds</option>
        </Select>
        <Select
          aria-label="Category"
          value={filters.categories[0] ?? ""}
          onChange={(e) => go({ cat: e.target.value || null, sub: null })}
          className="h-9 w-auto shrink-0 rounded-full py-0 pr-8 text-sm"
        >
          <option value="">All categories</option>
          {app.categories.filter((c) => !filters.type || c.kind === kind).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <button
          type="button"
          aria-pressed={filters.core}
          onClick={() => go({ core: filters.core ? null : "1" })}
          className={cn("h-9 shrink-0 rounded-full border px-4 text-sm", filters.core ? "border-text bg-text text-bg" : "border-border bg-surface-2 text-muted")}
        >
          Core only
        </button>
        <button type="button" onClick={() => setMore(true)} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-border bg-surface-2 px-4 text-sm text-muted">
          <SlidersHorizontal size={14} /> More filters
        </button>
      </div>

      {chips.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips}
          <Link href={`?m=${month.slice(0, 7)}&mode=${mode}`} className="text-xs text-muted hover:text-text">Clear all</Link>
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
