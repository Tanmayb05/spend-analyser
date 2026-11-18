import "server-only";
import {
  APICallError,
  generateText,
  InvalidToolInputError,
  isStepCount,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  NoSuchToolError,
  Output,
  RetryError,
  type LanguageModel,
  type ToolSet,
  type UserContent,
} from "ai";
import type { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import { AI, AI_LIMITS, aiConfigured, QUOTA_GROUP, QUOTA_UNIT, type AiConfig, type AiTier } from "./config";
import { getModel, supportsFile, supportsTemperature } from "./provider";
import type { Enums } from "@/lib/data/types";

export type AiErrorCode = "not_configured" | "disabled" | "quota" | "global_limit" | "bad_response" | "upstream" | "auth" | "rate_limited" | "unsupported_file";

export class AiError extends Error {
  constructor(
    message: string,
    public code: AiErrorCode,
  ) {
    super(message);
  }
}

/** Provider-neutral input: a text prompt plus optional files (receipts). */
export type AiInput = { text: string; files?: { data: Uint8Array; mediaType: string }[] };

export const TIMEOUT_MS = 90_000;

/** Provider bodies that mean "bad key" even when the HTTP status is 400 (Gemini does this). */
const BAD_KEY = /API_KEY_INVALID|invalid x-api-key|Incorrect API key|invalid_api_key/i;

/** Translate any SDK/provider failure into a user-safe AiError. Never includes keys or request bodies. */
export function toAiError(e: unknown, cfg: AiConfig = AI): AiError {
  if (e instanceof AiError) return e;
  if (RetryError.isInstance(e)) return toAiError(e.lastError, cfg);
  if (NoObjectGeneratedError.isInstance(e) || NoOutputGeneratedError.isInstance(e))
    return new AiError("The AI's answer didn't match what we expected. Try again.", "bad_response");
  if (NoSuchToolError.isInstance(e) || InvalidToolInputError.isInstance(e))
    return new AiError("The AI asked for data in a way we couldn't handle. Try rephrasing.", "bad_response");
  if (APICallError.isInstance(e)) {
    const s = e.statusCode ?? 0;
    if (s === 401 || s === 403 || BAD_KEY.test(e.responseBody ?? "")) return new AiError(`The ${cfg.label} API key was rejected. Ask the admin to check it.`, "auth");
    if (s === 429) return new AiError(`${cfg.label} is rate-limiting requests right now. Wait a minute and try again.`, "rate_limited");
    if (s === 400 || s === 413 || s === 422) return new AiError(`${cfg.label} couldn't process this request (it may be too large or unsupported).`, "bad_response");
    return new AiError(`${cfg.label} is having trouble right now (${s || "network"}). Try again shortly.`, "upstream");
  }
  const name = (e as Error)?.name;
  if (name === "TimeoutError" || name === "AbortError") return new AiError(`${cfg.label} took too long to answer. Try again.`, "upstream");
  return new AiError(`${cfg.label} request failed: ${(e as Error)?.message ?? String(e)}`, "upstream");
}

function content(input: AiInput): UserContent {
  return [
    ...(input.files ?? []).map((f) => ({ type: "file" as const, data: f.data, mediaType: f.mediaType })),
    { type: "text" as const, text: input.text },
  ];
}

/**
 * One structured-output model call, no auth/quota. Exported for unit tests (inject a mock model).
 */
export async function callModel<S extends z.ZodType>(opts: {
  model: LanguageModel;
  system: string;
  input: AiInput;
  schema: S;
  temperature?: number;
  timeoutMs?: number;
  cfg?: AiConfig;
}): Promise<{ data: z.infer<S>; tokensIn: number | null; tokensOut: number | null }> {
  const cfg = opts.cfg ?? AI;
  for (const f of opts.input.files ?? [])
    if (!supportsFile(f.mediaType, cfg)) throw new AiError(`${cfg.label} can't read ${f.mediaType} files. Use a PDF, PNG, JPG or WEBP.`, "unsupported_file");
  try {
    const res = await generateText({
      model: opts.model,
      system: opts.system,
      messages: [{ role: "user", content: content(opts.input) }],
      output: Output.object({ schema: opts.schema }),
      temperature: supportsTemperature(cfg) ? (opts.temperature ?? 0.1) : undefined,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
    });
    return { data: res.output as z.infer<S>, tokensIn: res.usage.inputTokens ?? null, tokensOut: res.usage.outputTokens ?? null };
  } catch (e) {
    throw toAiError(e, cfg);
  }
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

/**
 * Multi-step tool-calling run (Q&A). The model may call `tools` up to `maxSteps` rounds, then must answer in text.
 * No auth/quota; exported for unit tests.
 */
export async function callWithTools(opts: {
  model: LanguageModel;
  system: string;
  messages: ChatTurn[];
  tools: ToolSet;
  maxSteps?: number;
  timeoutMs?: number;
  cfg?: AiConfig;
}): Promise<{ text: string; tokensIn: number | null; tokensOut: number | null; toolCalls: string[] }> {
  const cfg = opts.cfg ?? AI;
  try {
    const res = await generateText({
      model: opts.model,
      system: opts.system,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      tools: opts.tools,
      stopWhen: isStepCount(opts.maxSteps ?? 6),
      temperature: supportsTemperature(cfg) ? 0.1 : undefined,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
    });
    const toolCalls = res.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName));
    const text = res.text.trim();
    if (!text) throw new AiError("The AI ran out of steps before answering. Try a narrower question.", "bad_response");
    return { text, tokensIn: res.totalUsage.inputTokens ?? null, tokensOut: res.totalUsage.outputTokens ?? null, toolCalls };
  } catch (e) {
    throw toAiError(e, cfg);
  }
}

/**
 * Reserve one unit of the user's monthly allowance for `feature`, run `fn`, then stamp tokens (or refund on failure).
 * Usage is recorded before the call so concurrent requests can't overspend.
 */
async function withQuota<T extends { tokensIn: number | null; tokensOut: number | null }>(
  feature: Enums["ai_feature"],
  tier: AiTier,
  fn: (model: LanguageModel) => Promise<T>,
): Promise<T & { remaining: number; modelId: string }> {
  const { supabase, userId } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("ai_enabled").eq("id", userId).single();
  if (profile && !profile.ai_enabled) throw new AiError("AI features are turned off in Settings → AI.", "disabled");
  if (!aiConfigured()) throw new AiError(`AI isn't set up on this server (${AI.keyEnv ?? "API key"} missing).`, "not_configured");

  const admin = createAdminClient();
  const group = QUOTA_GROUP[feature];
  const limit = AI_LIMITS[group];
  const quota = await admin.rpc("consume_ai_quota", {
    p_user: userId,
    p_feature: feature,
    p_monthly_limit: limit,
    p_global_daily_limit: AI_LIMITS.globalDaily,
  });
  if (quota.error) {
    if (quota.error.message.includes("AI_QUOTA_EXCEEDED"))
      throw new AiError(`You've used all ${limit} ${QUOTA_UNIT[group]} for this month. They reset on the 1st.`, "quota");
    if (quota.error.message.includes("AI_GLOBAL_LIMIT")) throw new AiError("The AI is busy today. Try again tomorrow.", "global_limit");
    throw new AiError(quota.error.message, "upstream");
  }
  const { usage_id, remaining } = quota.data![0];

  const { model, modelId } = getModel(tier);
  try {
    const res = await fn(model);
    await admin.from("ai_usage").update({ tokens_in: res.tokensIn, tokens_out: res.tokensOut, provider: AI.provider, model: modelId }).eq("id", usage_id);
    return { ...res, remaining, modelId };
  } catch (e) {
    await admin.from("ai_usage").delete().eq("id", usage_id); // refund failed calls
    throw toAiError(e);
  }
}

/** One quota-checked LLM call that must return JSON matching `schema`. */
export async function generateJson<S extends z.ZodType>(opts: {
  feature: Enums["ai_feature"];
  model?: AiTier;
  system: string;
  input: AiInput;
  schema: S;
  temperature?: number;
}): Promise<{ data: z.infer<S>; remaining: number; modelId: string }> {
  const r = await withQuota(opts.feature, opts.model ?? "fast", (model) =>
    callModel({ model, system: opts.system, input: opts.input, schema: opts.schema, temperature: opts.temperature }),
  );
  return { data: r.data, remaining: r.remaining, modelId: r.modelId };
}

/** One quota-checked Q&A run with read-only tools. */
export async function generateAnswer(opts: {
  feature: Enums["ai_feature"];
  model?: AiTier;
  system: string;
  messages: ChatTurn[];
  tools: ToolSet;
  maxSteps?: number;
}): Promise<{ text: string; toolCalls: string[]; remaining: number; modelId: string }> {
  const r = await withQuota(opts.feature, opts.model ?? "fast", (model) =>
    callWithTools({ model, system: opts.system, messages: opts.messages, tools: opts.tools, maxSteps: opts.maxSteps }),
  );
  return { text: r.text, toolCalls: r.toolCalls, remaining: r.remaining, modelId: r.modelId };
}
