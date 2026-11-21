"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { InfoTitle } from "@/components/ui/info-title";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/components/app-data";

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

/**
 * Page title (with optional controls beside it, via children), plus (desktop only) an "Add transaction" button on the right.
 * The month lives in the calendar card (`?m=`), scope in the calendar card. Mobile uses the bottom-nav "+" instead.
 */
export function DashboardHeader({ title = "Overview", info, addTransaction = false, children }: { title?: string; info?: ReactNode; addTransaction?: boolean; children?: ReactNode }) {
  const { openTxnSheet } = useAppData();
  return (
    <div className="mb-5 flex min-w-0 items-center justify-between gap-4">
      <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3">
        <InfoTitle as="h1" info={info} className="text-2xl font-medium" panelClassName="max-w-xl">{title}</InfoTitle>
        {children}
      </div>
      {addTransaction ? (
        <Button variant="accent" onClick={() => openTxnSheet()} className="hidden shrink-0 lg:inline-flex">
          <Plus size={18} /> Add transaction
        </Button>
      ) : null}
    </div>
  );
}
