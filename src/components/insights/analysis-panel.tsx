"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { runAnalysisAction, type AnalysisScope } from "@/app/(app)/ai/actions";
import type { Analysis } from "@/lib/ai/schemas";

const SEV = {
  good: { dot: "bg-good", cls: "text-good", label: "Good" },
  watch: { dot: "bg-warn", cls: "text-warn", label: "Watch" },
  alert: { dot: "bg-bad", cls: "text-bad", label: "Alert" },
} as const;

export function AnalysisPanel({
  scope,
  cached,
  stale,
  generatedAt,
  left,
  limit,
  ready,
}: {
  scope: AnalysisScope;
  cached: Analysis | null;
  stale: boolean;
  generatedAt: string | null;
  left: number;
  limit: number;
  ready: boolean;
}) {
  const [result, setResult] = useState<Analysis | null>(cached);
  const [remaining, setRemaining] = useState(left);
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = () =>
    start(async () => {
      const r = await runAnalysisAction(scope);
      if (!r.ok) return void toast.error(r.error);
      setResult(r.result);
      setRemaining(r.remaining);
      router.refresh();
    });

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="card-title">Written analysis</h2>
          <p className="mt-1 text-sm text-muted">A plain-language read of your totals, budgets and trends for the period above</p>
        </div>
        {ready ? (
          <Button onClick={run} disabled={pending || remaining <= 0} variant={result ? "outline" : "accent"}>
            <RefreshCw size={16} className={cn(pending && "animate-spin")} />
            {pending ? "Analysing…" : result ? `Regenerate · ${remaining} of ${limit} left` : `Analyse · ${remaining} of ${limit} left`}
          </Button>
        ) : null}
      </div>
      {!ready ? (
        <p className="mt-4 text-sm text-muted">AI isn&apos;t configured on this server. Rule-based insights above still work.</p>
      ) : result ? (
        <div className="mt-5 space-y-5">
          <div>
            <p className="text-xl font-medium leading-snug">{result.headline}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{result.summary}</p>
            {generatedAt ? (
              <p className="mt-2 text-xs text-faint">
                Generated {new Date(generatedAt).toLocaleString()}
                {stale ? " · your data changed since, regenerate for fresh numbers" : ""}
              </p>
            ) : null}
          </div>
          <ul className="divide-y divide-border border-y border-border">
            {result.insights.map((i, idx) => {
              const s = SEV[i.severity];
              return (
                <li key={idx} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className={cn("text-label inline-flex items-center gap-1.5", s.cls)}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} aria-hidden />
                      {s.label}
                    </p>
                    <p className="mt-1 font-medium">{i.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted">{i.detail}</p>
                  </div>
                  {i.metric ? <span className="num shrink-0 text-lg font-medium">{i.metric}</span> : null}
                </li>
              );
            })}
          </ul>
          <div>
            <p className="mb-2 text-sm font-medium">What to do next</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
              {result.actions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ol>
          </div>
          <p className="text-xs text-faint">AI-generated from your monthly totals. Not financial advice.</p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">
          The AI reads your monthly totals, budgets and trends and explains what stands out. Each run uses one of your {limit} monthly analyses; results are saved, so viewing them again is free.
        </p>
      )}
    </Card>
  );
}
