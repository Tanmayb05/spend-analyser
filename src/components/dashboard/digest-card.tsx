"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpRight, Newspaper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runAnalysisAction } from "@/app/(app)/ai/actions";

/**
 * Last month in review: the cached deep analysis for the previous month, or a button to write it.
 * Reuses the analysis allowance and cache, so the Insights page shows the same result.
 */
export function DigestCard({ month, label, cached, ready, left }: { month: string; label: string; cached: { headline: string; summary: string } | null; ready: boolean; left: number }) {
  const [result, setResult] = useState(cached);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!result && !ready) return null;
  const write = () =>
    start(async () => {
      const r = await runAnalysisAction({ scope: "month", month });
      if (!r.ok) return void toast.error(r.error);
      setResult(r.result);
      router.refresh();
    });
  const href = `/insights?${new URLSearchParams({ m: month.slice(0, 7), scope: "month" })}`;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
      <Newspaper size={16} className="shrink-0 text-accent" />
      {result ? (
        <>
          <span className="min-w-0 flex-1">
            <span className="font-medium">{label} in review: </span>
            <span className="text-muted">{result.headline}</span>
          </span>
          <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-muted hover:text-text">
            Read <ArrowUpRight size={14} />
          </Link>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 text-muted">Your {label} digest is ready to write: a short AI review of last month.</span>
          <Button size="sm" variant="outline" onClick={write} disabled={pending || left <= 0}>
            {pending ? "Writing…" : `Write it · ${left} left`}
          </Button>
        </>
      )}
    </div>
  );
}
