import { describe, expect, it } from "vitest";
import { aiConfigured, resolveAiConfig, supportsTranscription } from "@/lib/ai/config";

describe("resolveAiConfig", () => {
  it("defaults to gemini with built-in models", () => {
    const c = resolveAiConfig({ GEMINI_API_KEY: "k" });
    expect(c.provider).toBe("gemini");
    expect(c.models).toEqual({ fast: "gemini-2.5-flash", smart: "gemini-2.5-pro" });
    expect(c.keyEnv).toBe("GEMINI_API_KEY");
    expect(aiConfigured(c)).toBe(true);
  });

  it("selects each provider's own key and defaults", () => {
    const claude = resolveAiConfig({ AI_PROVIDER: "claude", CLAUDE_API_KEY: "c", GEMINI_API_KEY: "g" });
    expect(claude.key).toBe("c");
    expect(claude.models.fast).toBe("claude-haiku-5-5");
    expect(claude.label).toBe("Claude");
    const openai = resolveAiConfig({ AI_PROVIDER: "OpenAI ", OPENAI_API_KEY: "o" });
    expect(openai.provider).toBe("openai");
    expect(openai.key).toBe("o");
  });

  it("is not configured when the selected provider has no key", () => {
    const c = resolveAiConfig({ AI_PROVIDER: "claude", GEMINI_API_KEY: "g" });
    expect(aiConfigured(c)).toBe(false);
    expect(aiConfigured(resolveAiConfig({ AI_PROVIDER: "claude", CLAUDE_API_KEY: "   " }))).toBe(false);
  });

  it("applies AI_MODEL_* overrides, and legacy GEMINI_MODEL_* only for gemini", () => {
    expect(resolveAiConfig({ GEMINI_MODEL_FAST: "g-fast" }).models.fast).toBe("g-fast");
    expect(resolveAiConfig({ GEMINI_MODEL_FAST: "g-fast", AI_MODEL_FAST: "x" }).models.fast).toBe("x");
    expect(resolveAiConfig({ AI_PROVIDER: "claude", GEMINI_MODEL_FAST: "g-fast" }).models.fast).toBe("claude-haiku-5-5");
    expect(resolveAiConfig({ AI_PROVIDER: "claude", AI_MODEL_SMART: "claude-opus-5-5" }).models.smart).toBe("claude-opus-5-5");
  });

  it("rejects unknown providers with a clear message", () => {
    expect(() => resolveAiConfig({ AI_PROVIDER: "llama" })).toThrow(/Unknown AI_PROVIDER "llama"/);
  });

  it("allows mock only outside production", () => {
    expect(aiConfigured(resolveAiConfig({ AI_PROVIDER: "mock" }))).toBe(true);
    expect(() => resolveAiConfig({ AI_PROVIDER: "mock", NODE_ENV: "production" })).toThrow(/only allowed outside production/);
  });

  it("picks a speech model per provider, and none for Claude", () => {
    expect(resolveAiConfig({ GEMINI_API_KEY: "k" }).transcribeModel).toBe("gemini-3.5-transcribe");
    expect(resolveAiConfig({ AI_PROVIDER: "openai", OPENAI_API_KEY: "o" }).transcribeModel).toBe("gpt-4o-mini-transcribe");
    const claude = resolveAiConfig({ AI_PROVIDER: "claude", CLAUDE_API_KEY: "c", AI_MODEL_TRANSCRIBE: "ignored" });
    expect(claude.transcribeModel).toBeNull();
    expect(supportsTranscription(claude)).toBe(false);
    expect(supportsTranscription(resolveAiConfig({ GEMINI_API_KEY: "k" }))).toBe(true);
    expect(supportsTranscription(resolveAiConfig({ AI_PROVIDER: "mock" }))).toBe(true);
  });

  it("lets AI_MODEL_TRANSCRIBE override the speech model", () => {
    expect(resolveAiConfig({ GEMINI_API_KEY: "k", AI_MODEL_TRANSCRIBE: "gemini-x" }).transcribeModel).toBe("gemini-x");
  });
});
