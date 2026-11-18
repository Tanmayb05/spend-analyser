import { describe, expect, it, vi } from "vitest";
import { APICallError, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { AiError, callModel, callWithTools } from "@/lib/ai/generate";
import { supportsFile } from "@/lib/ai/provider";
import { mockModel } from "@/lib/ai/mock";
import { resolveAiConfig } from "@/lib/ai/config";
import { analysisSchema, anomalySchema, categorizeSchema, itemNamesSchema, merchantCleanupSchema, parseTextSchema, receiptSchema } from "@/lib/ai/schemas";

const usage = {
  inputTokens: { total: 11, noCache: 11, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 7, text: 7, reasoning: undefined },
};
const reply = (text: string) => ({ content: [{ type: "text" as const, text }], finishReason: { unified: "stop" as const, raw: undefined }, usage, warnings: [] });
const schema = z.object({ amount: z.number().positive(), label: z.string() });
const apiError = (statusCode: number) =>
  new APICallError({ message: `HTTP ${statusCode}`, url: "https://example.test", requestBodyValues: {}, statusCode, isRetryable: statusCode === 429 || statusCode >= 500 });

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    expect(e).toBeInstanceOf(AiError);
    return (e as AiError).code;
  }
}

describe("callModel", () => {
  it("returns validated data and token usage", async () => {
    const model = new MockLanguageModelV4({ doGenerate: async () => reply('{"amount":12.5,"label":"lunch"}') });
    const r = await callModel({ model, system: "sys", input: { text: "hi" }, schema });
    expect(r).toMatchObject({ data: { amount: 12.5, label: "lunch" }, tokensIn: 11, tokensOut: 7 });
    expect(r.stats).toEqual({ usage: { input: 11, output: 7, cacheRead: null, cacheWrite: null, reasoning: null }, finishReason: "stop", steps: 1, toolCalls: 0 });
  });

  it("sends system prompt, files and text to the model", async () => {
    const model = new MockLanguageModelV4({ doGenerate: async () => reply('{"amount":1,"label":"x"}') });
    const pdf = new TextEncoder().encode("%PDF-1.7");
    await callModel({ model, system: "be precise", input: { text: "read this", files: [{ data: pdf, mediaType: "application/pdf" }] }, schema });
    const prompt = model.doGenerateCalls[0].prompt;
    expect(prompt[0]).toMatchObject({ role: "system", content: "be precise" });
    const user = prompt.find((m) => m.role === "user")!;
    const parts = user.content as Array<{ type: string; mediaType?: string; text?: string }>;
    expect(parts.find((p) => p.type === "file")?.mediaType).toBe("application/pdf");
    expect(parts.find((p) => p.type === "text")?.text).toBe("read this");
    expect(model.doGenerateCalls[0].responseFormat).toMatchObject({ type: "json" });
  });

  it("keeps the tokens a failed validation still used", async () => {
    const notJson = new MockLanguageModelV4({ doGenerate: async () => reply("sorry, I can't") });
    const err = await callModel({ model: notJson, system: "", input: { text: "x" }, schema }).catch((e) => e as AiError);
    expect(err).toBeInstanceOf(AiError);
    expect(err.stats?.usage).toMatchObject({ input: 11, output: 7 });
  });

  it("maps unreadable or schema-invalid output to bad_response", async () => {
    const notJson = new MockLanguageModelV4({ doGenerate: async () => reply("sorry, I can't") });
    expect(await codeOf(callModel({ model: notJson, system: "", input: { text: "x" }, schema }))).toBe("bad_response");
    const wrongShape = new MockLanguageModelV4({ doGenerate: async () => reply('{"amount":-5,"label":"x"}') });
    expect(await codeOf(callModel({ model: wrongShape, system: "", input: { text: "x" }, schema }))).toBe("bad_response");
  });

  it.each([
    [401, "auth"],
    [403, "auth"],
    [429, "rate_limited"],
    [400, "bad_response"],
    [413, "bad_response"],
    [500, "upstream"],
    [503, "upstream"],
  ])("maps HTTP %i to %s", async (status, code) => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw apiError(status);
      },
    });
    expect(await codeOf(callModel({ model, system: "", input: { text: "x" }, schema }))).toBe(code);
  });

  it("treats Gemini's 400 API_KEY_INVALID as an auth error", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: "API key not valid",
          url: "https://example.test",
          requestBodyValues: {},
          statusCode: 400,
          responseBody: '{"error":{"code":400,"message":"API key not valid.","details":[{"reason":"API_KEY_INVALID"}]}}',
          isRetryable: false,
        });
      },
    });
    expect(await codeOf(callModel({ model, system: "", input: { text: "x" }, schema }))).toBe("auth");
  });

  it("does not send temperature to Claude, does to others", async () => {
    for (const [p, expected] of [["claude", undefined], ["gemini", 0.3]] as const) {
      const model = new MockLanguageModelV4({ doGenerate: async () => reply('{"amount":1,"label":"x"}') });
      await callModel({ model, system: "", input: { text: "x" }, schema, temperature: 0.3, cfg: resolveAiConfig({ AI_PROVIDER: p }) });
      expect(model.doGenerateCalls[0].temperature).toBe(expected);
    }
  });

  it("rejects files the provider can't read, before calling it", async () => {
    const model = new MockLanguageModelV4({ doGenerate: async () => reply("{}") });
    const heic = { data: new Uint8Array([0]), mediaType: "image/heic" };
    const p = callModel({ model, system: "", input: { text: "x", files: [heic] }, schema, cfg: resolveAiConfig({ AI_PROVIDER: "claude" }) });
    expect(await codeOf(p)).toBe("unsupported_file");
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("retries a rate-limited call once and succeeds", async () => {
    let n = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        if (n++ === 0) throw apiError(429);
        return reply('{"amount":2,"label":"ok"}');
      },
    });
    const r = await callModel({ model, system: "", input: { text: "x" }, schema });
    expect(r.data.label).toBe("ok");
    expect(n).toBe(2);
  });

  it("maps a timeout to upstream", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: (opts) =>
        new Promise((_, reject) => {
          opts.abortSignal?.addEventListener("abort", () => reject(opts.abortSignal!.reason));
        }),
    });
    expect(await codeOf(callModel({ model, system: "", input: { text: "x" }, schema, timeoutMs: 20 }))).toBe("upstream");
  });

  it("never leaks the API key in error messages", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw apiError(401);
      },
    });
    const err = (await callModel({ model, system: "", input: { text: "x" }, schema }).catch((e: unknown) => e)) as Error;
    expect(err).toBeInstanceOf(AiError);
    expect(err.message).not.toMatch(/sk-|key=/i);
  });
});

describe("callWithTools (Q&A)", () => {
  const toolCall = (toolName: string, input: unknown, id = "c1") => ({
    content: [{ type: "tool-call" as const, toolCallId: id, toolName, input: JSON.stringify(input) }],
    finishReason: { unified: "tool-calls" as const, raw: undefined },
    usage,
    warnings: [],
  });
  const totals = () =>
    tool({
      description: "totals",
      inputSchema: z.object({ month: z.string() }),
      execute: vi.fn(async ({ month }: { month: string }) => ({ month, spent: 120 })),
    });

  it("runs a tool, feeds the result back and returns the answer", async () => {
    let n = 0;
    const model = new MockLanguageModelV4({ doGenerate: async () => (n++ === 0 ? toolCall("totals", { month: "2026-10" }) : reply("You spent $120 in October.")) });
    const tools = { totals: totals() };
    const r = await callWithTools({ model, system: "s", messages: [{ role: "user", content: "how much in october?" }], tools });
    expect(r.text).toBe("You spent $120 in October.");
    expect(r.toolCalls).toEqual(["totals"]);
    expect(tools.totals.execute).toHaveBeenCalledWith({ month: "2026-10" }, expect.anything());
    // second model call saw the tool result
    const second = JSON.stringify(model.doGenerateCalls[1].prompt);
    expect(second).toContain('"spent":120');
    expect(r.tokensIn).toBe(22);
    expect(r.stats).toMatchObject({ steps: 2, toolCalls: 1, finishReason: "stop" });
  });

  it("stops after maxSteps; no final text is a bad_response", async () => {
    const model = new MockLanguageModelV4({ doGenerate: async () => toolCall("totals", { month: "2026-10" }) });
    const tools = { totals: totals() };
    const p = callWithTools({ model, system: "s", messages: [{ role: "user", content: "loop forever" }], tools, maxSteps: 3 });
    expect(await codeOf(p)).toBe("bad_response");
    expect(model.doGenerateCalls).toHaveLength(3);
    expect(tools.totals.execute).toHaveBeenCalledTimes(3);
  });

  it("never runs a tool the model made up, and never runs bad input", async () => {
    let n = 0;
    const tools = { totals: totals() };
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        n++;
        if (n === 1) return toolCall("run_sql", { sql: "drop table transactions" });
        if (n === 2) return toolCall("totals", { month: 42 }, "c2");
        return reply("I can only read summaries.");
      },
    });
    const r = await callWithTools({ model, system: "s", messages: [{ role: "user", content: "x" }], tools }).catch((e: unknown) => e);
    expect(tools.totals.execute).not.toHaveBeenCalled();
    if (r instanceof AiError) expect(r.code).toBe("bad_response");
    else expect((r as { text: string }).text).toBe("I can only read summaries.");
  });
});

describe("file support per provider", () => {
  it("only Gemini reads HEIC; everyone reads PDF and JPG", () => {
    for (const p of ["gemini", "claude", "openai"]) {
      const cfg = resolveAiConfig({ AI_PROVIDER: p });
      expect(supportsFile("application/pdf", cfg)).toBe(true);
      expect(supportsFile("image/jpeg", cfg)).toBe(true);
      expect(supportsFile("image/heic", cfg)).toBe(p === "gemini");
    }
  });
});

describe("mock provider", () => {
  it.each([
    ["parse text", parseTextSchema],
    ["receipt", receiptSchema],
    ["analysis", analysisSchema],
    ["categorize", categorizeSchema],
    ["merchants", merchantCleanupSchema],
    ["items", itemNamesSchema],
    ["anomalies", anomalySchema],
  ])("returns a schema-valid %s fixture", async (_, s) => {
    const r = await callModel({ model: mockModel(), system: "", input: { text: "x" }, schema: s });
    expect(s.safeParse(r.data).success).toBe(true);
  });
});
