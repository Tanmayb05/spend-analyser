import type { Enums, Tables } from "@/lib/supabase/database.types";

/** Pure aggregation of ai_call_log rows for the usage page (kept free of server imports so it is unit-testable). */
export type CallRow = Pick<
  Tables<"ai_call_log">,
  | "id"
  | "feature"
  | "provider"
  | "model"
  | "status"
  | "error_code"
  | "latency_ms"
  | "tokens_in"
  | "tokens_out"
  | "cache_read_tokens"
  | "reasoning_tokens"
  | "tool_calls"
  | "cost_usd"
  | "created_at"
>;

export const FEATURE_LABEL: Record<Enums<"ai_feature">, string> = {
  parse_text: "Smart Add",
  transcribe: "Voice add",
  parse_receipt: "Receipt scan",
  analysis: "Analysis & digest",
  categorize: "Bulk categorise",
  merchants: "Merchant clean-up",
  items: "Item names",
  anomalies: "Anomaly scan",
  chat: "Ask your data",
};

export type Bucket = {
  key: string;
  calls: number;
  ok: number;
  errors: number;
  blocked: number;
  /** ok / (ok + errors); blocked calls never reached the model */
  successPct: number | null;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  reasoning: number;
  toolCalls: number;
  costUsd: number;
  /** calls whose model had no price (cost shown is a lower bound) */
  unpriced: number;
  avgMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
};

export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

export function bucket(key: string, rows: CallRow[]): Bucket {
  const ok = rows.filter((r) => r.status === "ok").length;
  const errors = rows.filter((r) => r.status === "error").length;
  const sum = (f: (r: CallRow) => number | null) => rows.reduce((a, r) => a + (f(r) ?? 0), 0);
  // latency of calls that reached the model (successes and failures)
  const ms = rows
    .filter((r) => r.status !== "blocked" && r.latency_ms != null)
    .map((r) => r.latency_ms!)
    .sort((a, b) => a - b);
  return {
    key,
    calls: rows.length,
    ok,
    errors,
    blocked: rows.length - ok - errors,
    successPct: ok + errors === 0 ? null : Math.round((1000 * ok) / (ok + errors)) / 10,
    tokensIn: sum((r) => r.tokens_in),
    tokensOut: sum((r) => r.tokens_out),
    cacheRead: sum((r) => r.cache_read_tokens),
    reasoning: sum((r) => r.reasoning_tokens),
    toolCalls: sum((r) => r.tool_calls),
    costUsd: Math.round(sum((r) => (r.cost_usd == null ? 0 : Number(r.cost_usd))) * 1e6) / 1e6,
    unpriced: rows.filter((r) => r.status !== "blocked" && r.cost_usd == null && (r.tokens_in != null || r.tokens_out != null)).length,
    avgMs: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null,
    p50Ms: percentile(ms, 50),
    p95Ms: percentile(ms, 95),
  };
}

function groupBy(rows: CallRow[], key: (r: CallRow) => string): Bucket[] {
  const m = new Map<string, CallRow[]>();
  for (const r of rows) {
    const k = key(r);
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return [...m].map(([k, rs]) => bucket(k, rs)).sort((a, b) => b.calls - a.calls || a.key.localeCompare(b.key));
}

export type DayPoint = { day: string; calls: number; errors: number; costUsd: number };

/** One point per UTC day from `from` to `to` (inclusive), zero-filled. */
export function byDay(rows: CallRow[], from: Date, to: Date): DayPoint[] {
  const m = new Map<string, DayPoint>();
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  for (; d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const k = d.toISOString().slice(0, 10);
    m.set(k, { day: k, calls: 0, errors: 0, costUsd: 0 });
  }
  for (const r of rows) {
    const p = m.get(r.created_at.slice(0, 10));
    if (!p) continue;
    p.calls += 1;
    if (r.status === "error") p.errors += 1;
    p.costUsd += r.cost_usd == null ? 0 : Number(r.cost_usd);
  }
  return [...m.values()].map((p) => ({ ...p, costUsd: Math.round(p.costUsd * 1e6) / 1e6 }));
}

export function summariseCalls(rows: CallRow[], from: Date, to: Date) {
  return {
    total: bucket("all", rows),
    byFeature: groupBy(rows, (r) => r.feature),
    byModel: groupBy(rows.filter((r) => r.status !== "blocked"), (r) => `${r.provider ?? "?"} · ${r.model ?? "?"}`),
    errors: groupBy(rows.filter((r) => r.status !== "ok"), (r) => r.error_code ?? "unknown").map((b) => ({ code: b.key, count: b.calls })),
    days: byDay(rows, from, to),
  };
}
