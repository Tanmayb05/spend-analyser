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
      compact
      ariaLabel="Compare with"
      value={value}
      onChange={(v) => go({ vs: v === "avg" ? null : v })}
      options={[
        { value: "avg", label: <Label full="3-month average" short="3-mo avg" /> },
        { value: "prev", label: <Label full="Last month" short="Last mo" /> },
        { value: "year", label: <Label full="Last year" short="Last yr" /> },
      ]}
    />
  );
}

/** Phones get the short form so the switch fits beside the month picker; screen readers always get the full one. */
function Label({ full, short }: { full: string; short: string }) {
  return (
    <>
      <span className="max-sm:hidden">{full}</span>
      <span className="sm:hidden" aria-hidden>{short}</span>
      <span className="sr-only sm:hidden">{full}</span>
    </>
  );
}
