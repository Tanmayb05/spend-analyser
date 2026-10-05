"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Eye, RefreshCw, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { runAnalysisAction, type AnalysisScope } from "@/app/(app)/ai/actions";
import type { Analysis } from "@/lib/ai/schemas";

const SEV = {
  good: { icon: CheckCircle2, cls: "text-good", label: "Good" },
  watch: { icon: Eye, cls: "text-warn", label: "Watch" },
  alert: { icon: AlertTriangle, cls: "text-bad", label: "Alert" },
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-accent" />
          <h2 className="text-lg font-medium">Deep analysis</h2>
        </div>
        {ready ? (
          <Button onClick={run} disabled={pending || remaining <= 0} variant={result ? "outline" : "accent"}>
            <RefreshCw size={16} className={cn(pending && "animate-spin")} />
            {pending ? "Analysing…" : result ? `Regenerate · ${remaining} of ${limit} left` : `Analyse · ${remaining} of ${limit} left`}
          </Button>
        ) : null}
      </div>
      {!ready ? (
        <p className="mt-3 text-sm text-muted">Gemini isn&apos;t configured on this server. Rule-based insights above still work.</p>
      ) : result ? (
        <div className="mt-5 space-y-5">
          {generatedAt ? (
            <p className="text-xs text-faint">
              Generated {new Date(generatedAt).toLocaleString()}
              {stale ? " · your data changed since, regenerate for fresh numbers" : ""}
            </p>
          ) : null}
          <div>
            <p className="text-2xl font-medium leading-snug">{result.headline}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{result.summary}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {result.insights.map((i, idx) => {
              const s = SEV[i.severity];
              const Icon = s.icon;
              return (
                <div key={idx} className="rounded-2xl bg-surface-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{i.title}</p>
                    {i.metric ? <span className="num shrink-0 text-lg font-medium">{i.metric}</span> : null}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{i.detail}</p>
                  <p className={cn("mt-2 inline-flex items-center gap-1 text-xs", s.cls)}>
                    <Icon size={13} /> {s.label}
                  </p>
                </div>
              );
            })}
          </div>
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
        <p className="mt-3 text-sm text-muted">
          Gemini reads your monthly totals, budgets and trends and explains what stands out. Each run uses one of your {limit} monthly analyses; results are saved, so viewing them again is free.
        </p>
      )}
    </Card>
  );
}
