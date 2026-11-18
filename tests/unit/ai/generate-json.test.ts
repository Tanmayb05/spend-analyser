import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";

// --- mocks -----------------------------------------------------------------
const state = vi.hoisted(() => ({
  aiEnabled: true,
  quotaError: null as null | { message: string },
  updates: [] as Array<Record<string, unknown>>,
  deletes: [] as number[],
  logs: [] as Array<Record<string, unknown>>,
  logFails: false,
  model: null as unknown,
}));

vi.mock("@/lib/supabase/server", () => ({
  requireUser: async () => ({
    userId: "u1",
    supabase: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { ai_enabled: state.aiEnabled } }) }) }) }) },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async () => (state.quotaError ? { error: state.quotaError, data: null } : { error: null, data: [{ usage_id: 42, remaining: 9 }] }),
    from: (table: string) => ({
      update: (row: Record<string, unknown>) => ({ eq: async () => void state.updates.push(row) }),
      delete: () => ({ eq: async (_: string, id: number) => void state.deletes.push(id) }),
      insert: async (row: Record<string, unknown>) => {
        if (table !== "ai_call_log") throw new Error(`unexpected insert into ${table}`);
        if (state.logFails) return { error: { code: "XX000", message: "boom" } };
        state.logs.push(row);
        return { error: null };
      },
    }),
  }),
}));

vi.mock("@/lib/ai/provider", () => ({
  getModel: () => ({ model: state.model, modelId: "test-model" }),
  supportsFile: () => true,
  supportsTemperature: () => true,
}));

vi.mock("@/lib/ai/config", async (orig) => {
  const real = await orig<typeof import("@/lib/ai/config")>();
  const AI = real.resolveAiConfig({ AI_PROVIDER: "claude", CLAUDE_API_KEY: "test" });
  return { ...real, AI, aiConfigured: () => true };
});

const { generateAnswer, generateJson } = await import("@/lib/ai/generate");

// --- helpers ---------------------------------------------------------------
const usage = {
  inputTokens: { total: 100, noCache: 60, cacheRead: 40, cacheWrite: undefined },
  outputTokens: { total: 20, text: 15, reasoning: 5 },
};
const modelReturning = (text: string) =>
  new MockLanguageModelV4({ doGenerate: async () => ({ content: [{ type: "text", text }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] }) });
const schema = z.object({ ok: z.boolean() });
const run = () => generateJson({ feature: "parse_text", system: "s", input: { text: "t" }, schema });

beforeEach(() => {
  state.aiEnabled = true;
  state.quotaError = null;
  state.updates = [];
  state.deletes = [];
  state.logs = [];
  state.logFails = false;
  state.model = modelReturning('{"ok":true}');
});

describe("generateJson", () => {
  it("returns data and records provider, model and tokens on the usage row", async () => {
    const r = await run();
    expect(r).toEqual({ data: { ok: true }, remaining: 9, modelId: "test-model" });
    expect(state.updates).toEqual([{ tokens_in: 100, tokens_out: 20, provider: "claude", model: "test-model" }]);
    expect(state.deletes).toEqual([]);
  });

  it("refunds the quota when the model fails", async () => {
    state.model = modelReturning("not json");
    await expect(run()).rejects.toMatchObject({ code: "bad_response" });
    expect(state.deletes).toEqual([42]);
    expect(state.updates).toEqual([]);
  });

  it("refuses when AI is disabled for the user, before using quota", async () => {
    state.aiEnabled = false;
    await expect(run()).rejects.toMatchObject({ code: "disabled" });
    expect(state.deletes).toEqual([]);
  });

  it("names the right allowance when a group is used up", async () => {
    state.quotaError = { message: "AI_QUOTA_EXCEEDED" };
    await expect(generateJson({ feature: "merchants", system: "s", input: { text: "t" }, schema })).rejects.toThrow(/tidy-up runs/);
    await expect(generateJson({ feature: "analysis", system: "s", input: { text: "t" }, schema })).rejects.toThrow(/analyses/);
  });

  it("generateAnswer goes through the same quota and refund path", async () => {
    state.model = modelReturning("You spent $10.");
    const r = await generateAnswer({ feature: "chat", system: "s", messages: [{ role: "user", content: "q" }], tools: {} });
    expect(r).toMatchObject({ text: "You spent $10.", remaining: 9, modelId: "test-model" });
    expect(state.updates).toHaveLength(1);
    state.model = modelReturning("   ");
    await expect(generateAnswer({ feature: "chat", system: "s", messages: [{ role: "user", content: "q" }], tools: {} })).rejects.toMatchObject({ code: "bad_response" });
    expect(state.deletes).toEqual([42]);
  });

  it("maps quota and global-limit errors", async () => {
    state.quotaError = { message: "AI_QUOTA_EXCEEDED" };
    await expect(run()).rejects.toMatchObject({ code: "quota" });
    state.quotaError = { message: "AI_GLOBAL_LIMIT" };
    await expect(run()).rejects.toMatchObject({ code: "global_limit" });
  });

  it("logs a successful call with tokens, time and cost", async () => {
    await run();
    expect(state.logs).toHaveLength(1);
    const log = state.logs[0];
    expect(log).toMatchObject({
      user_id: "u1",
      feature: "parse_text",
      provider: "claude",
      model: "test-model",
      tier: "fast",
      status: "ok",
      tokens_in: 100,
      tokens_out: 20,
      cache_read_tokens: 40,
      reasoning_tokens: 5,
      steps: 1,
      tool_calls: 0,
      finish_reason: "stop",
      file_count: 0,
      cost_usd: null, // "test-model" has no price
    });
    expect(log.latency_ms).toEqual(expect.any(Number));
    expect(log.input_bytes).toBe(2); // "s" + "t"
    expect(JSON.stringify(log)).not.toMatch(/ok":true/); // never the answer
  });

  it("logs a failed call with its error code and the tokens it still used", async () => {
    state.model = modelReturning("not json");
    await expect(run()).rejects.toMatchObject({ code: "bad_response" });
    expect(state.logs).toEqual([expect.objectContaining({ status: "error", error_code: "bad_response", tokens_in: 100, tokens_out: 20 })]);
  });

  it("logs calls stopped by a limit as blocked, without tokens", async () => {
    state.quotaError = { message: "AI_QUOTA_EXCEEDED" };
    await expect(run()).rejects.toMatchObject({ code: "quota" });
    expect(state.logs).toEqual([expect.objectContaining({ status: "blocked", error_code: "quota" })]);
    expect(state.logs[0]).not.toHaveProperty("tokens_in");
  });

  it("does not log when AI is disabled for the user", async () => {
    state.aiEnabled = false;
    await expect(run()).rejects.toMatchObject({ code: "disabled" });
    expect(state.logs).toEqual([]);
  });

  it("a failing log write never breaks the feature", async () => {
    state.logFails = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(run()).resolves.toMatchObject({ data: { ok: true } });
    expect(warn).toHaveBeenCalledWith("ai_call_log insert failed:", "XX000");
    warn.mockRestore();
  });

  it("logs file count and size for receipts", async () => {
    await generateJson({ feature: "parse_receipt", system: "", input: { text: "", files: [{ data: new Uint8Array(1000), mediaType: "image/png" }] }, schema });
    expect(state.logs[0]).toMatchObject({ feature: "parse_receipt", file_count: 1, input_bytes: 1000 });
  });
});
