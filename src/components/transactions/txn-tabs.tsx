"use client";

import { Segmented } from "@/components/ui/segmented";
import { useBackNavScroll, useFilterNav } from "@/hooks/use-back-nav";
import type { TxnTab } from "@/components/transactions/tab-intro";

/** Page-level switch beside the title: the ledger, plans (paid upfront or EMI), or credit-card balances. */
export function TxnTabs({ tab }: { tab: TxnTab }) {
  const go = useFilterNav();
  useBackNavScroll(); // mounted on every tab, so Back restores scroll across tabs and filters
  return (
    <Segmented<TxnTab>
      compact
      ariaLabel="Transactions view"
      value={tab}
      // `pk` is a retired plan-kind filter; drop it so old links don't linger in the URL
      onChange={(v) => go(v === "activity" ? { tab: null, pk: null } : { tab: v, pk: null })}
      options={[
        { value: "activity", label: "Activity" },
        { value: "plans", label: "Plans" },
        { value: "cards", label: "Cards" },
      ]}
    />
  );
}
