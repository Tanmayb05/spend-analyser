import "server-only";
import { GoogleGenAI, type Part } from "@google/genai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import { AI_LIMITS, GEMINI, aiConfigured } from "./config";
import type { Enums } from "@/lib/data/types";

export class AiError extends Error {
  constructor(
    message: string,
    public code: "not_configured" | "disabled" | "quota" | "global_limit" | "bad_response" | "upstream",
  ) {
    super(message);
  }
}

/** JSON Schema for Gemini's structured output (without the $schema marker). */
function jsonSchema(schema: z.ZodType) {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema, { unrepresentable: "any" }) as Record<string, unknown>;
  return rest;
}

let client: GoogleGenAI | null = null;
function gemini() {
  if (!aiConfigured()) throw new AiError("AI isn't set up on this server (GEMINI_API_KEY missing).", "not_configured");
  client ??= new GoogleGenAI({ apiKey: GEMINI.key });
  return client;
}

/**
 * One quota-checked Gemini call that must return JSON matching `schema`.
 * Usage is recorded before the call (so concurrent requests can't overspend) and refunded on failure.
 */
export async function generateJson<S extends z.ZodType>(opts: {
  feature: Enums["ai_feature"];
  model?: "fast" | "smart";
  system: string;
  parts: Part[];
  schema: S;
  temperature?: number;
}): Promise<{ data: z.infer<S>; remaining: number }> {
  const { supabase, userId } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("ai_enabled").eq("id", userId).single();
  if (profile && !profile.ai_enabled) throw new AiError("AI features are turned off in Settings → AI.", "disabled");
  const ai = gemini();

  const admin = createAdminClient();
  const limit = opts.feature === "analysis" ? AI_LIMITS.analysis : AI_LIMITS.parse;
  const quota = await admin.rpc("consume_ai_quota", {
    p_user: userId,
    p_feature: opts.feature,
    p_monthly_limit: limit,
    p_global_daily_limit: AI_LIMITS.globalDaily,
  });
  if (quota.error) {
    if (quota.error.message.includes("AI_QUOTA_EXCEEDED"))
      throw new AiError(`You've used all ${limit} ${opts.feature === "analysis" ? "analyses" : "smart entries"} for this month. They reset on the 1st.`, "quota");
    if (quota.error.message.includes("AI_GLOBAL_LIMIT")) throw new AiError("The AI is busy today. Try again tomorrow.", "global_limit");
    throw new AiError(quota.error.message, "upstream");
  }
  const { usage_id, remaining } = quota.data![0];

  try {
    const res = await ai.models.generateContent({
      model: opts.model === "smart" ? GEMINI.smart : GEMINI.fast,
      contents: [{ role: "user", parts: opts.parts }],
      config: {
        systemInstruction: opts.system,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema(opts.schema),
        temperature: opts.temperature ?? 0.1,
      },
    });
    const text = res.text ?? "";
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AiError("The AI returned something unreadable. Try again.", "bad_response");
    }
    const parsed = opts.schema.safeParse(json);
    if (!parsed.success) throw new AiError("The AI's answer didn't match what we expected. Try again.", "bad_response");

    await admin
      .from("ai_usage")
      .update({ tokens_in: res.usageMetadata?.promptTokenCount ?? null, tokens_out: res.usageMetadata?.candidatesTokenCount ?? null })
      .eq("id", usage_id);
    return { data: parsed.data, remaining };
  } catch (e) {
    await admin.from("ai_usage").delete().eq("id", usage_id); // refund failed calls
    if (e instanceof AiError) throw e;
    throw new AiError(`Gemini request failed: ${(e as Error).message}`, "upstream");
  }
}
