"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { addMonths, formatMonth } from "@/lib/dates";
import type { LedgerMode } from "@/lib/data/types";
import type { Scope } from "@/lib/analytics/summary";

export function useParamHref() {
  const sp = useSearchParams();
  return (patch: Record<string, string | null>, path = "") => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const q = next.toString();
    return `${path}${q ? `?${q}` : path ? "" : "?"}`;
  };
}

export function DashboardHeader({ month, mode, scope, title = "Overview" }: { month: string; mode: LedgerMode; scope: Scope; title?: string }) {
  const router = useRouter();
  const href = useParamHref();
  const prev = addMonths(month, -1).slice(0, 7);
  const next = addMonths(month, 1).slice(0, 7);

  return (
    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <h1 className="text-3xl font-medium sm:text-4xl">{title}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-full border border-border bg-surface-2 p-1">
          <Link href={href({ m: prev })} scroll={false} aria-label="Previous month" className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-3">
            <ChevronLeft size={18} />
          </Link>
          <label className="relative">
            <span className="block min-w-36 px-2 text-center text-sm font-medium">{formatMonth(month)}</span>
            <input
              type="month"
              aria-label="Pick month"
              value={month.slice(0, 7)}
              onChange={(e) => e.target.value && router.push(href({ m: e.target.value }), { scroll: false })}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          <Link href={href({ m: next })} scroll={false} aria-label="Next month" className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-3">
            <ChevronRight size={18} />
          </Link>
        </div>
        <Segmented
          ariaLabel="View"
          value={mode}
          onChange={(v) => router.push(href({ mode: v }), { scroll: false })}
          options={[
            { value: "normalized", label: "Normalized" },
            { value: "cash", label: "Cash" },
          ]}
        />
        <Segmented
          ariaLabel="Scope"
          value={scope}
          onChange={(v) => router.push(href({ scope: v === "all" ? null : v }), { scroll: false })}
          options={[
            { value: "all", label: "All" },
            { value: "core", label: "Core" },
          ]}
        />
      </div>
    </div>
  );
}
