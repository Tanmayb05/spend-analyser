import "server-only";
import { requireUser } from "@/lib/supabase/server";
import { AI_LIMITS } from "./config";

export async function getAiUsage() {
  const { supabase } = await requireUser();
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await supabase.from("ai_usage").select("feature").gte("created_at", start.toISOString());
  const analysis = (data ?? []).filter((r) => r.feature === "analysis").length;
  const parse = (data ?? []).length - analysis;
  return {
    analysis: { used: analysis, limit: AI_LIMITS.analysis, left: Math.max(0, AI_LIMITS.analysis - analysis) },
    parse: { used: parse, limit: AI_LIMITS.parse, left: Math.max(0, AI_LIMITS.parse - parse) },
  };
}
