import "server-only";
import type { LanguageModel, TranscriptionModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { AI, type AiConfig, type AiTier } from "./config";
import { mockModel, mockTranscriptionModel } from "./mock";

/** Media types each provider can read as an input file. */
const FILE_SUPPORT: Record<AiConfig["provider"], ReadonlySet<string>> = {
  gemini: new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"]),
  claude: new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]),
  openai: new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]),
  mock: new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"]),
};

export const supportsFile = (mediaType: string, cfg: AiConfig = AI) => FILE_SUPPORT[cfg.provider].has(mediaType);

/** Claude 5.x models reject sampling params (the SDK drops them with a warning), so don't send them. */
export const supportsTemperature = (cfg: AiConfig = AI) => cfg.provider !== "claude";

/** Build the AI SDK model for the configured provider. Feature code never sees which one it is. */
export function getModel(tier: AiTier, cfg: AiConfig = AI): { model: LanguageModel; modelId: string } {
  const modelId = cfg.models[tier];
  switch (cfg.provider) {
    case "gemini":
      return { model: createGoogleGenerativeAI({ apiKey: cfg.key })(modelId), modelId };
    case "claude":
      return { model: createAnthropic({ apiKey: cfg.key })(modelId), modelId };
    case "openai":
      return { model: createOpenAI({ apiKey: cfg.key })(modelId), modelId };
    case "mock":
      return { model: mockModel(), modelId };
  }
}

/** Speech-to-text model for the configured provider, or null when it has none (Claude). */
export function getTranscriptionModel(cfg: AiConfig = AI): { model: TranscriptionModel; modelId: string } | null {
  const modelId = cfg.transcribeModel;
  if (!modelId) return null;
  switch (cfg.provider) {
    case "gemini":
      return { model: createGoogleGenerativeAI({ apiKey: cfg.key }).transcription(modelId), modelId };
    case "openai":
      return { model: createOpenAI({ apiKey: cfg.key }).transcription(modelId), modelId };
    case "mock":
      return { model: mockTranscriptionModel(), modelId };
    case "claude":
      return null;
  }
}
