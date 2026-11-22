"use client";

import { Segmented } from "@/components/ui/segmented";
import { useFilterNav } from "@/hooks/use-back-nav";
import type { CompareBase } from "@/lib/analytics/insight-views";

/** What the Categories tab compares the month with. `avg` is the default and stays out of the URL. */
export function CompareSwitch({ value }: { value: CompareBase }) {
  const go = useFilterNav();
  return (
    <Segmented<CompareBase>
      size="sm"
      ariaLabel="Compare with"
      value={value}
      onChange={(v) => go({ vs: v === "avg" ? null : v })}
      options={[
        { value: "avg", label: "3-month average" },
        { value: "prev", label: "Last month" },
        { value: "year", label: "Last year" },
      ]}
    />
  );
}
