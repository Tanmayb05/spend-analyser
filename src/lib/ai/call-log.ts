import "server-only";
import { requireUser } from "@/lib/supabase/server";
import { summariseCalls, type CallRow } from "./call-stats";

export const CALL_RANGES = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "month", label: "This month" },
  { value: "90d", label: "90 days" },
] as const;
export type CallRange = (typeof CALL_RANGES)[number]["value"];

export function parseRange(v: unknown): CallRange {
  return CALL_RANGES.some((r) => r.value === v) ? (v as CallRange) : "30d";
}

export function rangeStart(range: CallRange, now = new Date()): Date {
  if (range === "month") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d;
}

/** Most rows read for one page view; the page says so if the range has more. */
const MAX_ROWS = 5000;

/** The signed-in user's own AI calls in `range`, summarised (RLS limits rows to the user). */
export async function getCallLog(range: CallRange) {
  const { supabase } = await requireUser();
  const now = new Date();
  const from = rangeStart(range, now);
  const { data, error } = await supabase
    .from("ai_call_log")
    .select("id, feature, provider, model, status, error_code, latency_ms, tokens_in, tokens_out, cache_read_tokens, reasoning_tokens, tool_calls, cost_usd, created_at")
    .gte("created_at", from.toISOString())
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as CallRow[];
  return { ...summariseCalls(rows, from, now), recent: rows.slice(0, 50), truncated: rows.length === MAX_ROWS };
}
