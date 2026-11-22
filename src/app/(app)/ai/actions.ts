"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { generateJson, generateTranscript } from "@/lib/ai/generate";
import { parseWav, VOICE_MAX_BYTES, VOICE_MAX_SECONDS, VOICE_MIN_SECONDS } from "@/lib/voice";
import { analysisSchema, parseTextSchema, type Analysis } from "@/lib/ai/schemas";
import { buildAnalysisInput } from "@/lib/ai/aggregates";
import { analysisSystem, parseTextSystem } from "@/lib/ai/prompts";
import { categoryList, context, matchCategory } from "@/lib/ai/context";
import { paymentLine, toPreset } from "@/lib/ai/parse-text";

type Fail = { ok: false; error: string };
const failOf = (e: unknown): Fail => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

// ---------------------------------------------------------------------------
// Text → transactions
// ---------------------------------------------------------------------------
export type TxnPreset = Record<string, string>;

export async function parseTextAction(text: string): Promise<{ ok: true; presets: TxnPreset[]; note: string | null; remaining: number } | Fail> {
  const t = z.string().trim().min(2).max(500).safeParse(text);
  if (!t.success) return { ok: false, error: "Type a short description, e.g. “12.50 Kroger groceries yesterday”." };
  try {
    const ctx = await context();
    const system = parseTextSystem(ctx.today, ctx.base);
    const prompt = [
      `Categories:\n${categoryList(ctx.cats, ctx.subs)}`,
      `Known merchants: ${ctx.merchants.map((m) => m.name).join(", ") || "none"}`,
      `Trips: ${ctx.trips.map((tr) => `${tr.name} (${tr.start_date ?? "?"}–${tr.end_date ?? "?"})`).join("; ") || "none"}`,
      `Payment methods: ${ctx.payments.map(paymentLine).join("; ") || "none"}`,
      `People: ${ctx.people.map((x) => x.name).join(", ") || "none"}`,
      `Note: """${t.data}"""`,
    ].join("\n\n");
    const { data, remaining } = await generateJson({ feature: "parse_text", system, input: { text: prompt }, schema: parseTextSchema });
    const presets = data.transactions.map((p) => toPreset(p, ctx, matchCategory(ctx.cats, ctx.subs, p.category, p.subcategory)));
    return { ok: true, presets, note: data.note, remaining };
  } catch (e) {
    return failOf(e);
  }
}

// ---------------------------------------------------------------------------
// Voice → text (the recorded clip is a 16-bit mono WAV; see lib/voice)
// ---------------------------------------------------------------------------
export async function transcribeAction(formData: FormData): Promise<{ ok: true; text: string; remaining: number } | Fail> {
  const file = formData.get("audio");
  if (!(file instanceof File)) return { ok: false, error: "No recording came through. Try again." };
  if (file.size > VOICE_MAX_BYTES) return { ok: false, error: `Recordings can be up to ${VOICE_MAX_SECONDS} seconds.` };
  const audio = new Uint8Array(await file.arrayBuffer());
  const wav = parseWav(audio);
  if (!wav || wav.channels !== 1 || wav.sampleRate < 8_000 || wav.sampleRate > 48_000) return { ok: false, error: "That recording couldn't be read. Try again." };
  if (wav.seconds < VOICE_MIN_SECONDS) return { ok: false, error: "That was too short. Hold on a little longer and say the whole entry." };
  if (wav.seconds > VOICE_MAX_SECONDS + 1) return { ok: false, error: `Recordings can be up to ${VOICE_MAX_SECONDS} seconds.` };
  try {
    const { text, remaining } = await generateTranscript({ audio });
    return { ok: true, text, remaining };
  } catch (e) {
    return failOf(e);
  }
}

// ---------------------------------------------------------------------------
// Deep analysis (cached)
// ---------------------------------------------------------------------------
const scopeSchema = z.object({ scope: z.enum(["month", "quarter", "year"]), month: z.string().regex(/^\d{4}-\d{2}-01$/) });
export type AnalysisScope = z.infer<typeof scopeSchema>;

export async function runAnalysisAction(input: AnalysisScope): Promise<{ ok: true; result: Analysis; remaining: number } | Fail> {
  const v = scopeSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "Invalid scope" };
  try {
    const { supabase } = await requireUser();
    const { payload, fingerprint, currency } = await buildAnalysisInput(v.data);
    if (!payload.months.some((m) => m.spent > 0 || m.income > 0)) return { ok: false, error: "Not enough data in this period to analyse." };
    const system = analysisSystem(currency);
    const { data, remaining, modelId } = await generateJson({
      feature: "analysis",
      model: "smart",
      system,
      input: { text: `Data (JSON):\n${JSON.stringify(payload)}` },
      schema: analysisSchema,
      temperature: 0.3,
    });
    const scopeKey = `${v.data.scope}|${v.data.month}`;
    await supabase.from("ai_insights").insert({ scope_key: scopeKey, scope: { ...v.data, fingerprint } as never, result: data as never, model: modelId });
    revalidatePath("/insights");
    return { ok: true, result: data, remaining };
  } catch (e) {
    return failOf(e);
  }
}
