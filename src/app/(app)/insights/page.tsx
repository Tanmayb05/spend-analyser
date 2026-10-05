import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { AnalysisPanel } from "@/components/insights/analysis-panel";
import { getReferenceData } from "@/lib/data/reference";
import { getLedger, parseMode } from "@/lib/data/ledger";
import { requireUser } from "@/lib/supabase/server";
import { getAiUsage } from "@/lib/ai/usage";
import { buildAnalysisInput } from "@/lib/ai/aggregates";
import { addMonths, formatMonth, isValidMonthParam, monthEnd, monthStart } from "@/lib/dates";
import { budgetTotals, budgetsForMonth } from "@/lib/analytics/budgets";
import { lastMonths, monthlySeries } from "@/lib/analytics/summary";
import { ruleInsights } from "@/lib/analytics/insights";
import { cn } from "@/lib/utils";
import type { Analysis } from "@/lib/ai/schemas";

export const metadata = { title: "Insights" };
const TONE = { good: "bg-good", warn: "bg-warn", bad: "bg-bad", neutral: "bg-faint" } as const;

export default async function InsightsPage({ searchParams }: PageProps<"/insights">) {
  const sp = await searchParams;
  const ref = await getReferenceData();
  const month = isValidMonthParam(sp.m as string) ? `${sp.m}-01` : monthStart(ref.today);
  const mode = parseMode(sp.mode, ref.profile.dashboard_mode);
  const scopeName = sp.scope === "quarter" || sp.scope === "year" ? sp.scope : "month";
  const scope = { scope: scopeName, month, mode } as const;
  const scopeKey = `${scopeName}|${month}|${mode}`;

  const { supabase } = await requireUser();
  const [rows, usage, cachedRow] = await Promise.all([
    getLedger(mode, addMonths(month, -14), monthEnd(addMonths(month, 3))),
    getAiUsage(),
    supabase.from("ai_insights").select("result, scope, created_at").eq("scope_key", scopeKey).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  let stale = false;
  if (cachedRow.data && ref.aiReady) {
    const { fingerprint } = await buildAnalysisInput(scope);
    stale = (cachedRow.data.scope as { fingerprint?: string })?.fingerprint !== fingerprint;
  }

  const resolved = budgetsForMonth(ref.budgets, ref.categories, month);
  const rules = ruleInsights(
    {
      rows,
      series: monthlySeries(rows, lastMonths(month, 13), ref.today),
      month,
      today: ref.today,
      budgets: resolved,
      totals: budgetTotals(resolved, ref.categories),
      categoryName: (id) => ref.categories.find((c) => c.id === id)?.name ?? "Other",
      currency: ref.profile.base_currency,
    },
    6,
  );

  const link = (patch: Record<string, string>) => `?${new URLSearchParams({ m: month.slice(0, 7), mode, scope: scopeName, ...patch })}`;

  return (
    <>
      <h1 className="text-3xl font-medium sm:text-4xl">Insights</h1>
      <p className="mb-5 mt-1 text-sm text-muted">What stands out in your money, in plain words.</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-full border border-border bg-surface-2 p-1 text-sm">
          <Link href={link({ m: addMonths(month, -1).slice(0, 7) })} className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-3" aria-label="Previous month">‹</Link>
          <span className="min-w-36 text-center font-medium">{formatMonth(month)}</span>
          <Link href={link({ m: addMonths(month, 1).slice(0, 7) })} className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-3" aria-label="Next month">›</Link>
        </div>
        <div className="inline-flex rounded-full border border-border bg-surface-2 p-1">
          {(["month", "quarter", "year"] as const).map((s) => (
            <Link key={s} href={link({ scope: s })} className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium", scopeName === s ? "bg-text text-bg" : "text-muted")}>
              {s === "month" ? "This month" : s === "quarter" ? "3 months" : "12 months"}
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Quick insights" subtitle="Automatic checks, free and always up to date" />
          <ul className="space-y-3">
            {rules.map((i) => (
              <li key={i.id} className="flex gap-3 text-sm leading-relaxed">
                <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", TONE[i.tone])} aria-hidden />
                {i.text}
              </li>
            ))}
            {!rules.length ? <li className="text-sm text-muted">Nothing unusual this month.</li> : null}
          </ul>
        </Card>
        <AnalysisPanel
          key={scopeKey}
          scope={scope}
          cached={(cachedRow.data?.result as Analysis | undefined) ?? null}
          stale={stale}
          generatedAt={cachedRow.data?.created_at ?? null}
          left={usage.analysis.left}
          limit={usage.analysis.limit}
          ready={ref.aiReady}
        />
      </div>
    </>
  );
}
