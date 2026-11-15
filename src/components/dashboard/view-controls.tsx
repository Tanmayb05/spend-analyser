"use client";

import { useRouter } from "next/navigation";
import { Segmented } from "@/components/ui/segmented";
import { useParamHref } from "@/components/dashboard/dashboard-header";
import { SCOPE_LABEL } from "@/lib/labels";
import type { Scope } from "@/lib/analytics/summary";

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
