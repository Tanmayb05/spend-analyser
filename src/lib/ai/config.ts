import type { Enums } from "@/lib/supabase/database.types";

export const AI_LIMITS = {
  analysis: Number(process.env.AI_LIMIT_ANALYSIS ?? 5),
  parse: Number(process.env.AI_LIMIT_PARSE ?? 100),
  organize: Number(process.env.AI_LIMIT_ORGANIZE ?? 20),
  chat: Number(process.env.AI_LIMIT_CHAT ?? 50),
  globalDaily: Number(process.env.AI_GLOBAL_DAILY_LIMIT ?? 300),
};

/** Monthly allowance groups. Mirrors public.ai_quota_group() in SQL. */
export type QuotaGroup = "analysis" | "parse" | "organize" | "chat";
export const QUOTA_GROUP: Record<Enums<"ai_feature">, QuotaGroup> = {
  analysis: "analysis",
  parse_text: "parse",
  parse_receipt: "parse",
  transcribe: "parse",
  categorize: "organize",
  merchants: "organize",
  items: "organize",
  anomalies: "organize",
  chat: "chat",
};
/** What one unit of each allowance is called in messages ("You've used all 20 tidy-up runs"). */
export const QUOTA_UNIT: Record<QuotaGroup, string> = { analysis: "analyses", parse: "smart entries", organize: "tidy-up runs", chat: "questions" };

export const AI_PROVIDERS = ["gemini", "claude", "openai", "mock"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];
export type AiTier = "fast" | "smart";

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  gemini: "Gemini",
  claude: "Claude",
  openai: "OpenAI",
  mock: "Mock AI",
};

/** Env var that holds each provider's API key. */
export const PROVIDER_KEY_ENV: Record<Exclude<AiProvider, "mock">, string> = {
  gemini: "GEMINI_API_KEY",
  claude: "CLAUDE_API_KEY",
  openai: "OPENAI_API_KEY",
};

export const DEFAULT_MODELS: Record<AiProvider, Record<AiTier, string>> = {
  gemini: { fast: "gemini-2.5-flash", smart: "gemini-2.5-pro" },
  claude: { fast: "claude-haiku-5-5", smart: "claude-sonnet-5-5" },
  openai: { fast: "gpt-5.4-mini", smart: "gpt-5.5" },
  mock: { fast: "mock-fast", smart: "mock-smart" },
};

/** Speech-to-text model per provider. Claude has none (Anthropic takes no audio), so voice falls back to the browser there. */
export const DEFAULT_TRANSCRIBE_MODELS: Record<AiProvider, string | null> = {
  gemini: "gemini-3.5-transcribe",
  claude: null,
  openai: "gpt-4o-mini-transcribe",
  mock: "mock-transcribe",
};

export type AiConfig = {
  provider: AiProvider;
  label: string;
  key: string;
  keyEnv: string | null;
  models: Record<AiTier, string>;
  /** null when the provider can't transcribe audio */
  transcribeModel: string | null;
};

type Env = Record<string, string | undefined>;

/**
 * Resolve which LLM provider/models the server uses. Pure (takes env) so it can be unit-tested.
 * AI_PROVIDER picks the provider (default gemini); AI_MODEL_FAST/SMART/TRANSCRIBE override models.
 * GEMINI_MODEL_FAST/SMART are still honoured when the provider is gemini (back-compat).
 */
export function resolveAiConfig(env: Env = process.env): AiConfig {
  const raw = (env.AI_PROVIDER ?? "").trim().toLowerCase() || "gemini";
  if (!(AI_PROVIDERS as readonly string[]).includes(raw))
    throw new Error(`Unknown AI_PROVIDER "${raw}". Use one of: ${AI_PROVIDERS.filter((p) => p !== "mock").join(", ")}.`);
  const provider = raw as AiProvider;
  if (provider === "mock" && env.NODE_ENV === "production") throw new Error("AI_PROVIDER=mock is only allowed outside production.");

  const legacy = provider === "gemini" ? { fast: env.GEMINI_MODEL_FAST, smart: env.GEMINI_MODEL_SMART } : { fast: undefined, smart: undefined };
  const models = {
    fast: env.AI_MODEL_FAST || legacy.fast || DEFAULT_MODELS[provider].fast,
    smart: env.AI_MODEL_SMART || legacy.smart || DEFAULT_MODELS[provider].smart,
  };
  const keyEnv = provider === "mock" ? null : PROVIDER_KEY_ENV[provider];
  const transcribeModel = DEFAULT_TRANSCRIBE_MODELS[provider] === null ? null : env.AI_MODEL_TRANSCRIBE || DEFAULT_TRANSCRIBE_MODELS[provider];
  return { provider, label: PROVIDER_LABEL[provider], key: keyEnv ? (env[keyEnv] ?? "").trim() : "", keyEnv, models, transcribeModel };
}

export const AI = resolveAiConfig();

export const aiConfigured = (cfg: AiConfig = AI) => cfg.provider === "mock" || Boolean(cfg.key);

/** True when the configured provider can turn recorded speech into text. */
export const supportsTranscription = (cfg: AiConfig = AI) => cfg.transcribeModel !== null;
