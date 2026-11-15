"use client";

import { useRouter } from "next/navigation";
import { Segmented } from "@/components/ui/segmented";
import { useParamHref } from "@/components/dashboard/dashboard-header";
import { MODE_HINT, MODE_OPTIONS, SCOPE_LABEL } from "@/lib/labels";
import type { LedgerMode } from "@/lib/data/types";
import type { Scope } from "@/lib/analytics/summary";

/** How expenses are counted. Changes every number on the page; lives in the summary card header. */
export function ModeControl({ mode }: { mode: LedgerMode }) {
  const router = useRouter();
  const href = useParamHref();
  return (
    <div className="flex flex-col gap-1.5 sm:items-end">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">Accounting</span>
        <Segmented
          ariaLabel="Accounting mode"
          value={mode}
          onChange={(v) => router.push(href({ mode: v }), { scroll: false })}
          options={MODE_OPTIONS}
        />
      </div>
      <p className="text-xs text-faint" aria-live="polite">{MODE_HINT[mode]}</p>
    </div>
  );
}

/** Which spending is explored. Filters only the calendar and the donut; lives in the calendar header. */
export function ScopeControl({ scope }: { scope: Scope }) {
  const router = useRouter();
  const href = useParamHref();
  return (
    <Segmented
      ariaLabel="Spending scope"
      value={scope}
      onChange={(v) => router.push(href({ scope: v === "all" ? null : v }), { scroll: false })}
      options={(["all", "core"] as const).map((value) => ({ value, label: SCOPE_LABEL[value] }))}
    />
  );
}
