import "server-only";
import { requireUser } from "@/lib/supabase/server";
import { AI_LIMITS, QUOTA_GROUP, type QuotaGroup } from "./config";

export type QuotaMeter = { used: number; limit: number; left: number };

/** This month's usage per allowance group (counts match consume_ai_quota). */
export async function getAiUsage(): Promise<Record<QuotaGroup, QuotaMeter>> {
  const { supabase } = await requireUser();
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await supabase.from("ai_usage").select("feature").gte("created_at", start.toISOString());
  const used: Record<QuotaGroup, number> = { analysis: 0, parse: 0, organize: 0, chat: 0 };
  for (const r of data ?? []) used[QUOTA_GROUP[r.feature]] += 1;
  const meter = (g: QuotaGroup): QuotaMeter => ({ used: used[g], limit: AI_LIMITS[g], left: Math.max(0, AI_LIMITS[g] - used[g]) });
  return { analysis: meter("analysis"), parse: meter("parse"), organize: meter("organize"), chat: meter("chat") };
}
