"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { InfoTitle } from "@/components/ui/info-title";

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

/** Page title only. The month lives in the calendar card (`?m=`), accounting mode in the summary card, scope in the calendar card. */
export function DashboardHeader({ title = "Overview", info }: { title?: string; info?: ReactNode }) {
  return (
    <div className="mb-5 min-w-0">
      <InfoTitle as="h1" info={info} className="text-3xl font-medium sm:text-4xl" panelClassName="max-w-xl">{title}</InfoTitle>
    </div>
  );
}
