"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/components/app-data";

/** Empty-state action: opens the add sheet with "Spread this cost" already on and the plan type picked. */
export function AddPlanButton({ kind }: { kind: "spread" | "emi" }) {
  const { openTxnSheet } = useAppData();
  return (
    <Button onClick={() => openTxnSheet({ preset: { spread: "1", plan_kind: kind } })}>
      <Plus size={18} /> {kind === "emi" ? "Add an EMI" : "Add a spread purchase"}
    </Button>
  );
}
