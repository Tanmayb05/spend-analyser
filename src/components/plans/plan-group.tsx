"use client";

import { PlanTicket, type PlanView } from "./plan-ticket";
import { PlanDetail } from "./plan-detail";
import { useBackSheet } from "@/hooks/use-back-nav";

/** A list of plan tickets that share one detail sheet. Clicking a ticket opens the plan; editing and deleting happen from there. */
export function PlanGroup({ plans, className }: { plans: PlanView[]; className?: string }) {
  const detail = useBackSheet<PlanView>();
  return (
    <>
      <div className={className}>
        {plans.map((p) => (
          <PlanTicket key={p.txnId} p={p} onOpen={detail.show} />
        ))}
      </div>
      <PlanDetail plan={detail.value} onClose={detail.hide} />
    </>
  );
}
