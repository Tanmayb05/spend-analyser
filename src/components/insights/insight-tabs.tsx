"use client";

import { Segmented } from "@/components/ui/segmented";
import { useFilterNav } from "@/hooks/use-back-nav";
import type { InsightTab } from "@/components/insights/tabs";

/** Page-level switch beside the title. The month and scope stay in the URL when the tab changes. */
export function InsightTabs({ tab }: { tab: InsightTab }) {
  const go = useFilterNav();
  return (
    <Segmented<InsightTab>
      compact
      ariaLabel="Insights view"
      value={tab}
      onChange={(v) => go({ tab: v === "overview" ? null : v })}
      options={[
        { value: "overview", label: "Overview" },
        { value: "categories", label: "Categories" },
        { value: "habits", label: "Habits" },
        { value: "ai", label: "AI" },
      ]}
    />
  );
}
