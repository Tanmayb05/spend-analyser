"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { generateAnswer, generateJson } from "@/lib/ai/generate";
import { anomalySchema } from "@/lib/ai/schemas";
import { anomalySystem, askSystem } from "@/lib/ai/prompts";
import { anomalyPrompt, mapAnomalies, type AnomalyCandidate } from "@/lib/ai/tidy";
import { buildFinanceTools } from "@/lib/ai/tools";
import { getLedger } from "@/lib/data/ledger";
import { todayIn } from "@/lib/dates";

type Fail = { ok: false; error: string };
const failOf = (e: unknown): Fail => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

// ---------------------------------------------------------------------------
// Ask your data (tool calling over the user's own ledger)
// ---------------------------------------------------------------------------
const askSchema = z.object({
  question: z.string().trim().min(3).max(400),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) })).max(12),
});

export async function askAction(input: z.input<typeof askSchema>): Promise<{ ok: true; answer: string; remaining: number } | Fail> {
  const v = askSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "Ask a question between 3 and 400 characters." };
  try {
    const { supabase, userId } = await requireUser();
    const [profile, cats, subs] = await Promise.all([
      supabase.from("profiles").select("base_currency, timezone").eq("id", userId).single(),
      supabase.from("categories").select("*").eq("archived", false).order("sort_order"),
      supabase.from("subcategories").select("*").eq("archived", false),
    ]);
    const today = todayIn(profile.data?.timezone ?? "UTC");
    const categories = cats.data ?? [];
    const tools = buildFinanceTools({ ledger: (from, to) => getLedger(from, to), categories, subcategories: subs.data ?? [], today });
    const { text, remaining } = await generateAnswer({
      feature: "chat",
      system: askSystem(today, profile.data?.base_currency ?? "USD", categories.map((c) => `${c.name} (${c.kind})`).join(", ")),
      messages: [...v.data.history.slice(-6), { role: "user", content: v.data.question }],
      tools,
      maxSteps: 6,
    });
    return { ok: true, answer: text, remaining };
  } catch (e) {
    return failOf(e);
  }
}

// ---------------------------------------------------------------------------
// Unusual & duplicate transactions
// ---------------------------------------------------------------------------
export async function scanAnomaliesAction(): Promise<{ ok: true; message: string } | Fail> {
  try {
    const { supabase, userId } = await requireUser();
    const profile = await supabase.from("profiles").select("base_currency, timezone").eq("id", userId).single();
    const today = todayIn(profile.data?.timezone ?? "UTC");
    const from = new Date(`${today}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - 120);
    const { data, error } = await supabase.rpc("anomaly_candidates", { p_from: from.toISOString().slice(0, 10), p_to: today });
    if (error) return { ok: false, error: error.message };
    const cands = (data ?? []).map((c) => ({ ...c, amount: Number(c.amount), typical: c.typical == null ? null : Number(c.typical) })) as AnomalyCandidate[];
    if (!cands.length) return { ok: true, message: "Nothing new to check. No AI run used." };

    const { data: res } = await generateJson({
      feature: "anomalies",
      system: anomalySystem(profile.data?.base_currency ?? "USD"),
      input: { text: anomalyPrompt(cands) },
      schema: anomalySchema,
    });
    const flags = mapAnomalies(res, cands);
    if (flags.length) {
      const ins = await supabase.from("ai_flags").upsert(flags, { onConflict: "transaction_id,kind", ignoreDuplicates: true });
      if (ins.error) return { ok: false, error: ins.error.message };
    }
    revalidatePath("/insights");
    const shown = flags.filter((f) => !f.dismissed).length;
    return { ok: true, message: shown ? `Found ${shown} thing${shown === 1 ? "" : "s"} worth a look` : `Checked ${flags.length}, all look fine` };
  } catch (e) {
    return failOf(e);
  }
}

export async function dismissFlagAction(id: string): Promise<{ ok: true } | Fail> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid flag." };
  const { supabase } = await requireUser();
  const { error } = await supabase.from("ai_flags").update({ dismissed: true }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/insights");
  return { ok: true };
}
