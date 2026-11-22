import "server-only";
import {
  APICallError,
  generateText,
  InvalidToolInputError,
  isStepCount,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  NoSuchToolError,
  NoTranscriptGeneratedError,
  Output,
  RetryError,
  transcribe,
  type LanguageModel,
  type TranscriptionModel,
  type LanguageModelUsage,
  type ToolSet,
  type UserContent,
} from "ai";
import type { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import { AI, AI_LIMITS, aiConfigured, QUOTA_GROUP, QUOTA_UNIT, supportsTranscription, type AiConfig, type AiTier } from "./config";
import { getModel, getTranscriptionModel, supportsFile, supportsTemperature } from "./provider";
import { costUsd, type TokenUsage } from "./pricing";
import type { Enums } from "@/lib/data/types";
import type { TablesInsert } from "@/lib/supabase/database.types";

export type AiErrorCode = "not_configured" | "disabled" | "quota" | "global_limit" | "bad_response" | "upstream" | "auth" | "rate_limited" | "unsupported_file";

/** What one model run used, for the call log. Steps > 1 only for tool-calling runs. */
export type CallStats = { usage: TokenUsage; finishReason: string | null; steps: number; toolCalls: number };

export class AiError extends Error {
  /** tokens spent before the failure, when the provider reported them (e.g. an answer that failed validation) */
  stats?: CallStats;
  constructor(
    message: string,
    public code: AiErrorCode,
  ) {
    super(message);
  }
}

export function toTokenUsage(u: LanguageModelUsage | undefined): TokenUsage {
  return {
    input: u?.inputTokens ?? null,
    output: u?.outputTokens ?? null,
    cacheRead: u?.inputTokenDetails?.cacheReadTokens ?? null,
    cacheWrite: u?.inputTokenDetails?.cacheWriteTokens ?? null,
    reasoning: u?.outputTokenDetails?.reasoningTokens ?? null,
  };
}

/** Keep the usage a failed-but-billed call reported (validation failures still cost tokens). */
function withFailureStats(e: unknown, cfg: AiConfig): AiError {
  const err = toAiError(e, cfg);
  if (!err.stats && NoObjectGeneratedError.isInstance(e) && e.usage)
    err.stats = { usage: toTokenUsage(e.usage), finishReason: e.finishReason ?? null, steps: 1, toolCalls: 0 };
  return err;
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
  if (NoTranscriptGeneratedError.isInstance(e)) return new AiError("Couldn't make out any words in that recording. Try again.", "bad_response");
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
}): Promise<{ data: z.infer<S>; tokensIn: number | null; tokensOut: number | null; stats: CallStats }> {
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
    const stats: CallStats = { usage: toTokenUsage(res.usage), finishReason: res.finishReason ?? null, steps: 1, toolCalls: 0 };
    return { data: res.output as z.infer<S>, tokensIn: stats.usage.input, tokensOut: stats.usage.output, stats };
  } catch (e) {
    throw withFailureStats(e, cfg);
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
}): Promise<{ text: string; tokensIn: number | null; tokensOut: number | null; toolCalls: string[]; stats: CallStats }> {
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
    const stats: CallStats = { usage: toTokenUsage(res.totalUsage), finishReason: res.finishReason ?? null, steps: res.steps.length, toolCalls: toolCalls.length };
    const text = res.text.trim();
    if (!text) {
      const err = new AiError("The AI ran out of steps before answering. Try a narrower question.", "bad_response");
      err.stats = stats;
      throw err;
    }
    return { text, tokensIn: stats.usage.input, tokensOut: stats.usage.output, toolCalls, stats };
  } catch (e) {
    throw withFailureStats(e, cfg);
  }
}

type Admin = ReturnType<typeof createAdminClient>;
type CallLogRow = TablesInsert<"ai_call_log">;

/** Write one call-log row. Logging must never break the feature, so failures are swallowed (and never print row data). */
async function logCall(admin: Admin, row: CallLogRow) {
  try {
    const { error } = await admin.from("ai_call_log").insert(row);
    if (error) console.warn("ai_call_log insert failed:", error.code);
  } catch {
    console.warn("ai_call_log insert failed");
  }
}

/** Log-row fields that come from a model run's stats. */
export function statsColumns(modelId: string | null, stats: CallStats | undefined) {
  if (!stats) return {};
  const u = stats.usage;
  return {
    tokens_in: u.input,
    tokens_out: u.output,
    cache_read_tokens: u.cacheRead,
    cache_write_tokens: u.cacheWrite,
    reasoning_tokens: u.reasoning,
    steps: stats.steps,
    tool_calls: stats.toolCalls,
    finish_reason: stats.finishReason?.slice(0, 40) ?? null,
    cost_usd: costUsd(modelId, u),
  };
}

/** Size of what is sent, for the log (never the content). */
export type CallInputMeta = { fileCount: number; inputBytes: number };

type ModelTarget<M> = { modelName: string; resolve: () => { model: M; modelId: string } };

/**
 * Reserve one unit of the user's monthly allowance for `feature`, run `fn`, then stamp tokens (or refund on failure).
 * Usage is recorded before the call so concurrent requests can't overspend.
 * Every call that reaches the quota check is written to ai_call_log (ok / error / blocked).
 */
async function withQuota<T extends { tokensIn: number | null; tokensOut: number | null; stats: CallStats }, M = LanguageModel>(
  feature: Enums["ai_feature"],
  tier: AiTier,
  meta: CallInputMeta,
  fn: (model: M) => Promise<T>,
  /** Which model the call runs on. Defaults to the provider's text model for `tier`; speech-to-text passes its own. */
  target: ModelTarget<M> = { modelName: AI.models[tier], resolve: () => getModel(tier) as { model: M; modelId: string } },
): Promise<T & { remaining: number; modelId: string }> {
  const { supabase, userId } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("ai_enabled").eq("id", userId).single();
  if (profile && !profile.ai_enabled) throw new AiError("AI features are turned off in Settings → AI.", "disabled");
  if (!aiConfigured()) throw new AiError(`AI isn't set up on this server (${AI.keyEnv ?? "API key"} missing).`, "not_configured");

  const admin = createAdminClient();
  const base: CallLogRow = {
    user_id: userId,
    feature,
    provider: AI.provider,
    model: target.modelName,
    tier,
    status: "ok",
    file_count: meta.fileCount,
    input_bytes: meta.inputBytes,
  };
  const group = QUOTA_GROUP[feature];
  const limit = AI_LIMITS[group];
  const quota = await admin.rpc("consume_ai_quota", {
    p_user: userId,
    p_feature: feature,
    p_monthly_limit: limit,
    p_global_daily_limit: AI_LIMITS.globalDaily,
  });
  if (quota.error) {
    const msg = quota.error.message;
    const err = msg.includes("AI_QUOTA_EXCEEDED")
      ? new AiError(`You've used all ${limit} ${QUOTA_UNIT[group]} for this month. They reset on the 1st.`, "quota")
      : msg.includes("AI_GLOBAL_LIMIT")
        ? new AiError("The AI is busy today. Try again tomorrow.", "global_limit")
        : new AiError(msg, "upstream");
    await logCall(admin, { ...base, status: err.code === "upstream" ? "error" : "blocked", error_code: err.code });
    throw err;
  }
  const { usage_id, remaining } = quota.data![0];

  const { model, modelId } = target.resolve();
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  try {
    const res = await fn(model);
    const latency = elapsed();
    await admin.from("ai_usage").update({ tokens_in: res.tokensIn, tokens_out: res.tokensOut, provider: AI.provider, model: modelId }).eq("id", usage_id);
    await logCall(admin, { ...base, model: modelId, latency_ms: latency, ...statsColumns(modelId, res.stats) });
    return { ...res, remaining, modelId };
  } catch (e) {
    const latency = elapsed();
    const err = toAiError(e);
    await admin.from("ai_usage").delete().eq("id", usage_id); // refund failed calls
    await logCall(admin, { ...base, model: modelId, status: "error", error_code: err.code, latency_ms: latency, ...statsColumns(modelId, err.stats) });
    throw err;
  }
}

function inputMeta(text: string, files: { data: Uint8Array }[] = []): CallInputMeta {
  const bytes = new TextEncoder().encode(text).length + files.reduce((a, f) => a + f.data.byteLength, 0);
  return { fileCount: files.length, inputBytes: Math.min(bytes, 2_147_483_647) };
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
  const meta = inputMeta(opts.system + opts.input.text, opts.input.files);
  const r = await withQuota(opts.feature, opts.model ?? "fast", meta, (model) =>
    callModel({ model, system: opts.system, input: opts.input, schema: opts.schema, temperature: opts.temperature }),
  );
  return { data: r.data, remaining: r.remaining, modelId: r.modelId };
}

/**
 * One quota-checked extraction that may run twice: `primary` first (cheap, e.g. a PDF's text), and `fallback` (e.g. the
 * page images) when the primary answer fails `accept` or errors. The user is charged one unit either way.
 * Returns the fallback's answer even if it also fails `accept`, so the caller can show warnings instead of nothing.
 */
export async function generateJsonWithFallback<S extends z.ZodType>(opts: {
  feature: Enums["ai_feature"];
  model?: AiTier;
  system: string;
  primary: AiInput;
  fallback?: AiInput;
  accept: (data: z.infer<S>) => boolean;
  schema: S;
  temperature?: number;
}): Promise<{ data: z.infer<S>; remaining: number; modelId: string; path: "primary" | "fallback"; accepted: boolean }> {
  const inputs = [opts.primary, ...(opts.fallback ? [opts.fallback] : [])];
  const meta = inputMeta(opts.system + inputs.map((i) => i.text).join("\n"), inputs.flatMap((i) => i.files ?? []));
  const r = await withQuota(opts.feature, opts.model ?? "fast", meta, async (model) => {
    const run = (input: AiInput) => callModel({ model, system: opts.system, input, schema: opts.schema, temperature: opts.temperature });
    let first: Awaited<ReturnType<typeof run>> | null = null;
    try {
      first = await run(opts.primary);
      if (opts.accept(first.data) || !opts.fallback) return { ...first, path: "primary" as const, accepted: opts.accept(first.data) };
    } catch (e) {
      if (!opts.fallback) throw e;
    }
    const second = await run(opts.fallback!);
    const sum = (a: number | null, b: number | null) => (a == null && b == null ? null : (a ?? 0) + (b ?? 0));
    return {
      ...second,
      tokensIn: sum(first?.tokensIn ?? null, second.tokensIn),
      tokensOut: sum(first?.tokensOut ?? null, second.tokensOut),
      path: "fallback" as const,
      accepted: opts.accept(second.data),
    };
  });
  return { data: r.data, remaining: r.remaining, modelId: r.modelId, path: r.path, accepted: r.accepted };
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
  const meta = inputMeta(opts.system + opts.messages.map((m) => m.content).join("\n"));
  const r = await withQuota(opts.feature, opts.model ?? "fast", meta, (model) =>
    callWithTools({ model, system: opts.system, messages: opts.messages, tools: opts.tools, maxSteps: opts.maxSteps }),
  );
  return { text: r.text, toolCalls: r.toolCalls, remaining: r.remaining, modelId: r.modelId };
}

export const TRANSCRIBE_TIMEOUT_MS = 45_000;

/**
 * One quota-checked speech-to-text call. `audio` is a WAV clip (see lib/voice). Failed or empty transcripts are refunded.
 * Providers without a transcription model (Claude) are refused up front, before any quota is used.
 */
export async function generateTranscript(opts: { audio: Uint8Array }): Promise<{ text: string; remaining: number; modelId: string }> {
  if (!supportsTranscription()) throw new AiError(`${AI.label} can't turn speech into text here. Type it instead.`, "unsupported_file");
  const r = await withQuota<{ text: string; tokensIn: null; tokensOut: null; stats: CallStats }, TranscriptionModel>(
    "transcribe",
    "fast",
    { fileCount: 1, inputBytes: opts.audio.byteLength },
    async (model) => {
      const res = await transcribe({ model, audio: opts.audio, maxRetries: 1, abortSignal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS) });
      const text = res.text.trim();
      if (!text) throw new AiError("Didn't catch any words in that recording. Try again a little closer to the microphone.", "bad_response");
      const usage: TokenUsage = { input: null, output: null, cacheRead: null, cacheWrite: null, reasoning: null };
      return { text, tokensIn: null, tokensOut: null, stats: { usage, finishReason: null, steps: 1, toolCalls: 0 } };
    },
    {
      modelName: AI.transcribeModel ?? "",
      resolve: () => {
        const m = getTranscriptionModel();
        if (!m) throw new AiError(`${AI.label} can't turn speech into text here. Type it instead.`, "unsupported_file");
        return m;
      },
    },
  );
  return { text: r.text, remaining: r.remaining, modelId: r.modelId };
}
