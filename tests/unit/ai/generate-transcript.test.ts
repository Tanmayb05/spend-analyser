import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockTranscriptionModelV4 } from "ai/test";

// --- mocks -----------------------------------------------------------------
const state = vi.hoisted(() => ({
  quotaError: null as null | { message: string },
  rpcCalls: [] as Array<Record<string, unknown>>,
  deletes: [] as number[],
  logs: [] as Array<Record<string, unknown>>,
  heard: "twelve fifty at Kroger",
  fail: null as null | Error,
}));

vi.mock("@/lib/supabase/server", () => ({
  requireUser: async () => ({
    userId: "u1",
    supabase: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { ai_enabled: true } }) }) }) }) },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (_: string, args: Record<string, unknown>) => {
      state.rpcCalls.push(args);
      return state.quotaError ? { error: state.quotaError, data: null } : { error: null, data: [{ usage_id: 42, remaining: 9 }] };
    },
    from: () => ({
      update: () => ({ eq: async () => undefined }),
      delete: () => ({ eq: async (_: string, id: number) => void state.deletes.push(id) }),
      insert: async (row: Record<string, unknown>) => {
        state.logs.push(row);
        return { error: null };
      },
    }),
  }),
}));

vi.mock("@/lib/ai/provider", () => ({
  getModel: () => {
    throw new Error("transcription must not resolve a text model");
  },
  getTranscriptionModel: () => ({
    modelId: "test-transcribe",
    model: new MockTranscriptionModelV4({
      doGenerate: async () => {
        if (state.fail) throw state.fail;
        return { text: state.heard, segments: [], language: "en", durationInSeconds: 3, warnings: [], response: { timestamp: new Date(), modelId: "test-transcribe", headers: {} } };
      },
    }),
  }),
  supportsFile: () => true,
  supportsTemperature: () => true,
}));

vi.mock("@/lib/ai/config", async (orig) => {
  const real = await orig<typeof import("@/lib/ai/config")>();
  const AI = real.resolveAiConfig({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "test" });
  return { ...real, AI, aiConfigured: () => true, supportsTranscription: () => AI.transcribeModel !== null };
});

const config = await import("@/lib/ai/config");
const { generateTranscript, AiError } = await import("@/lib/ai/generate");

const audio = new Uint8Array(1000);

beforeEach(() => {
  state.quotaError = null;
  state.rpcCalls.length = 0;
  state.deletes.length = 0;
  state.logs.length = 0;
  state.heard = "twelve fifty at Kroger";
  state.fail = null;
  config.AI.transcribeModel = "gemini-3.5-transcribe";
});

describe("generateTranscript", () => {
  it("returns the trimmed transcript and logs a transcribe call under the speech model", async () => {
    state.heard = "  twelve fifty at Kroger \n";
    const r = await generateTranscript({ audio });
    expect(r).toEqual({ text: "twelve fifty at Kroger", remaining: 9, modelId: "test-transcribe" });
    expect(state.rpcCalls[0]).toMatchObject({ p_feature: "transcribe" });
    expect(state.logs).toHaveLength(1);
    expect(state.logs[0]).toMatchObject({ feature: "transcribe", model: "test-transcribe", status: "ok", file_count: 1, input_bytes: 1000 });
    expect(state.deletes).toEqual([]);
  });

  it("refunds the allowance and logs an error when nothing was heard", async () => {
    state.heard = "   ";
    await expect(generateTranscript({ audio })).rejects.toMatchObject({ code: "bad_response" });
    expect(state.deletes).toEqual([42]);
    expect(state.logs[0]).toMatchObject({ status: "error", error_code: "bad_response" });
  });

  it("refunds when the provider fails", async () => {
    state.fail = new Error("boom");
    await expect(generateTranscript({ audio })).rejects.toBeInstanceOf(AiError);
    expect(state.deletes).toEqual([42]);
    expect(state.logs[0]).toMatchObject({ status: "error", error_code: "upstream" });
  });

  it("stops at the monthly limit without calling the model", async () => {
    state.quotaError = { message: "AI_QUOTA_EXCEEDED" };
    await expect(generateTranscript({ audio })).rejects.toMatchObject({ code: "quota" });
    expect(state.logs[0]).toMatchObject({ status: "blocked", error_code: "quota" });
  });

  it("refuses a provider with no speech model before touching the allowance", async () => {
    config.AI.transcribeModel = null;
    await expect(generateTranscript({ audio })).rejects.toMatchObject({ code: "unsupported_file" });
    expect(state.rpcCalls).toEqual([]);
    expect(state.logs).toEqual([]);
  });
});
