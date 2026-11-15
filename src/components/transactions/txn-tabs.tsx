"use client";

import { useRouter } from "next/navigation";
import { Segmented } from "@/components/ui/segmented";
import { useParamHref } from "@/components/dashboard/dashboard-header";

export type TxnTab = "activity" | "plans";
export type PlanKindParam = "all" | "spread" | "emi";

/** Page-level switch beside the title: the ledger, or the plans & EMIs that generate its installment rows. */
export function TxnTabs({ tab, kind }: { tab: TxnTab; kind: PlanKindParam }) {
  const router = useRouter();
  const href = useParamHref();
  const go = (patch: Record<string, string | null>) => router.push(href(patch), { scroll: false });
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Segmented<TxnTab>
        ariaLabel="Transactions view"
        value={tab}
        onChange={(v) => go(v === "plans" ? { tab: "plans" } : { tab: null, pk: null })}
        options={[{ value: "activity", label: "Activity" }, { value: "plans", label: "Plans & EMIs" }]}
      />
      {tab === "plans" ? (
        <Segmented<PlanKindParam>
          ariaLabel="Plan type"
          size="sm"
          value={kind}
          onChange={(v) => go({ pk: v === "all" ? null : v })}
          options={[{ value: "all", label: "All" }, { value: "spread", label: "Plans" }, { value: "emi", label: "EMIs" }]}
        />
      ) : null}
    </div>
  );
}
