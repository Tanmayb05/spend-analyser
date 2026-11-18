import Link from "next/link";
import { Card, CardHeader, Insight } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingsPage } from "@/components/settings/section";
import { CALL_RANGES, getCallLog, parseRange } from "@/lib/ai/call-log";
import { FEATURE_LABEL, type Bucket, type DayPoint } from "@/lib/ai/call-stats";
import { compactNumber, niceTicks } from "@/components/charts/scale";
import { cn } from "@/lib/utils";
import type { Enums } from "@/lib/supabase/database.types";

export const metadata = { title: "AI usage" };

const usd = (n: number) => (n === 0 ? "$0" : n < 0.01 ? `$${n.toFixed(4)}` : n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`);
const secs = (ms: number | null) => (ms == null ? "–" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const tokens = (n: number) => (n === 0 ? "0" : compactNumber(n));
const pct = (n: number | null) => (n == null ? "–" : `${n}%`);

export default async function AiUsagePage({ searchParams }: PageProps<"/settings/ai/usage">) {
  const sp = await searchParams;
  const range = parseRange(sp.range);
  const log = await getCallLog(range);
  const t = log.total;
  const top = log.byFeature.filter((b) => b.costUsd > 0).sort((a, b) => b.costUsd - a.costUsd)[0];

  return (
    <SettingsPage
      title="AI usage"
      description="Every AI call you made: which feature, which model, tokens, time taken and estimated cost. Only counts and timings are kept, never what was sent or answered."
    >
      <nav aria-label="Time range" className="flex flex-wrap gap-2">
        {CALL_RANGES.map((r) => (
          <Link
            key={r.value}
            href={`?range=${r.value}`}
            scroll={false}
            aria-current={r.value === range ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-medium transition",
              r.value === range ? "border-text bg-text text-bg" : "border-border text-muted hover:text-text",
            )}
          >
            {r.label}
          </Link>
        ))}
      </nav>

      {t.calls === 0 ? (
        <Card>
          <p className="text-sm text-muted">No AI calls in this period. Use Smart Add, a receipt scan, analysis, tidy-up or Ask your data and they will show up here.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Calls" value={String(t.calls)} sub={`${t.ok} ok · ${t.errors} failed · ${t.blocked} blocked`} />
            <Stat label="Estimated cost" value={usd(t.costUsd)} sub={t.unpriced ? `${t.unpriced} call(s) on an unpriced model not included` : "at list prices"} />
            <Stat label="Tokens" value={`${tokens(t.tokensIn)} / ${tokens(t.tokensOut)}`} sub={`in / out${t.cacheRead ? ` · ${tokens(t.cacheRead)} cached` : ""}${t.reasoning ? ` · ${tokens(t.reasoning)} reasoning` : ""}`} />
            <Stat label="Time taken" value={secs(t.p50Ms)} sub={`typical · slowest 5%: ${secs(t.p95Ms)} · success ${pct(t.successPct)}`} />
          </div>

          <Card>
            <CardHeader title="Per day" subtitle="Calls each day (UTC). Hover a bar for cost and failures." />
            <DayBars days={log.days} />
            {top ? <Insight>{FEATURE_LABEL[top.key as Enums<"ai_feature">]} cost the most in this period: {usd(top.costUsd)} of {usd(t.costUsd)}.</Insight> : null}
          </Card>

          <Card>
            <CardHeader title="By feature" />
            <BucketTable rows={log.byFeature} label={(k) => FEATURE_LABEL[k as Enums<"ai_feature">] ?? k} first="Feature" />
          </Card>

          <Card>
            <CardHeader title="By model" subtitle="Blocked calls never reached a model, so they are left out here." />
            <BucketTable rows={log.byModel} label={(k) => k} first="Provider · model" />
          </Card>

          {log.errors.length ? (
            <Card>
              <CardHeader title="Failures and blocks" />
              <ul className="flex flex-wrap gap-2">
                {log.errors.map((e) => (
                  <li key={e.code}>
                    <Badge tone="warn">
                      {e.code.replace(/_/g, " ")}: {e.count}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Recent calls" subtitle={`Last ${log.recent.length} in this period.`} />
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-faint">
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Feature</th>
                    <th className="py-2 pr-3 font-medium">Model</th>
                    <th className="py-2 pr-3 font-medium">Result</th>
                    <th className="py-2 pr-3 text-right font-medium">Time</th>
                    <th className="py-2 pr-3 text-right font-medium">Tokens in / out</th>
                    <th className="py-2 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {log.recent.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="num py-2 pr-3 whitespace-nowrap text-muted">{new Date(r.created_at).toISOString().slice(0, 16).replace("T", " ")}</td>
                      <td className="py-2 pr-3">{FEATURE_LABEL[r.feature]}</td>
                      <td className="py-2 pr-3 text-muted">{r.model ?? "–"}</td>
                      <td className="py-2 pr-3">
                        <Badge tone={r.status === "ok" ? "good" : "warn"}>{r.status === "ok" ? "ok" : (r.error_code ?? r.status).replace(/_/g, " ")}</Badge>
                      </td>
                      <td className="num py-2 pr-3 text-right">{r.status === "blocked" ? "–" : secs(r.latency_ms)}</td>
                      <td className="num py-2 pr-3 text-right">{r.tokens_in == null ? "–" : `${tokens(r.tokens_in)} / ${tokens(r.tokens_out ?? 0)}`}</td>
                      <td className="num py-2 text-right">{r.cost_usd == null ? "–" : usd(Number(r.cost_usd))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {log.truncated ? <p className="mt-3 text-xs text-faint">This period has more than 5,000 calls; totals cover the latest 5,000.</p> : null}
          </Card>

          <p className="text-xs text-faint">
            Cost is an estimate from list prices at the time of each call. Your provider&apos;s bill is the source of truth. Blocked = stopped by a monthly or daily limit before reaching the AI; failed calls don&apos;t use your allowance.
          </p>
        </>
      )}
    </SettingsPage>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="num mt-2 text-2xl font-medium">{value}</p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </Card>
  );
}

function BucketTable({ rows, label, first }: { rows: Bucket[]; label: (k: string) => string; first: string }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-faint">
            <th className="py-2 pr-3 font-medium">{first}</th>
            <th className="py-2 pr-3 text-right font-medium">Calls</th>
            <th className="py-2 pr-3 text-right font-medium">Success</th>
            <th className="py-2 pr-3 text-right font-medium">Typical / slow</th>
            <th className="py-2 pr-3 text-right font-medium">Tokens in / out</th>
            <th className="py-2 pr-3 text-right font-medium">Cost</th>
            <th className="py-2 text-right font-medium">Per call</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.key} className="border-t border-border">
              <td className="py-2 pr-3">{label(b.key)}</td>
              <td className="num py-2 pr-3 text-right">
                {b.calls}
                {b.blocked ? <span className="text-faint"> ({b.blocked} blocked)</span> : null}
              </td>
              <td className="num py-2 pr-3 text-right">{pct(b.successPct)}</td>
              <td className="num py-2 pr-3 text-right">
                {secs(b.p50Ms)} / {secs(b.p95Ms)}
              </td>
              <td className="num py-2 pr-3 text-right">
                {tokens(b.tokensIn)} / {tokens(b.tokensOut)}
              </td>
              <td className="num py-2 pr-3 text-right">{usd(b.costUsd)}</td>
              <td className="num py-2 text-right">{b.ok + b.errors ? usd(b.costUsd / (b.ok + b.errors)) : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Calls per day; failures stacked on top in a second color. Native title tooltips keep this a server component. */
function DayBars({ days }: { days: DayPoint[] }) {
  // calls are whole numbers: keep the axis at 4+ so ticks never land on fractions
  const ticks = niceTicks(Math.max(4, ...days.map((d) => d.calls))).filter(Number.isInteger);
  const top = ticks[ticks.length - 1] || 1;
  const labelEvery = Math.ceil(days.length / 8);
  return (
    <div>
      <div className="mb-4 flex gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: "var(--c1)" }} /> ok
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: "var(--c4)" }} /> failed
        </span>
      </div>
      <div className="flex gap-2">
        <div className="relative w-8 shrink-0 text-right text-xs text-faint" style={{ height: 160 }}>
          {ticks.map((t) => (
            <span key={t} className="num absolute right-0 -translate-y-1/2" style={{ bottom: `${(t / top) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height: 160 }}>
            {ticks.map((t) => (
              <div key={t} className="pointer-events-none absolute inset-x-0 h-px bg-[var(--grid)]" style={{ bottom: `${(t / top) * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end">
              {days.map((d) => (
                <div
                  key={d.day}
                  title={`${d.day}: ${d.calls} call(s), ${d.errors} failed, ${usd(d.costUsd)}`}
                  aria-label={`${d.day}: ${d.calls} calls, ${d.errors} failed, ${usd(d.costUsd)}`}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end px-[2px]"
                >
                  <div className="mx-auto flex w-full max-w-4 flex-col justify-end" style={{ height: `${(d.calls / top) * 100}%` }}>
                    {d.errors ? <div className="w-full rounded-t-[3px]" style={{ height: `${(d.errors / Math.max(d.calls, 1)) * 100}%`, background: "var(--c4)" }} /> : null}
                    <div className={cn("w-full flex-1", !d.errors && "rounded-t-[3px]")} style={{ background: "var(--c1)", minHeight: d.calls > d.errors ? 2 : 0 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 flex">
            {days.map((d, i) => (
              <span key={d.day} className="min-w-0 flex-1 whitespace-nowrap text-center text-xs text-faint">
                {i % labelEvery === 0 ? d.day.slice(5) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
