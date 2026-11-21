import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { resolveAiConfig, type AiProvider, type AiTier } from "@/lib/ai/config";
import { callModel } from "@/lib/ai/generate";
import { getModel } from "@/lib/ai/provider";
import { receiptSystem } from "@/lib/ai/prompts";
import { scoreReceipt, summarise, type ReceiptTruth, type RunResult } from "@/lib/ai/receipt-score";
import { receiptSchema, toExtraction } from "@/lib/ai/schemas";

/**
 * Receipt accuracy eval: runs the app's own receipt prompt + schema over a labelled set of real receipts
 * and scores each with the Receipt Read Score (src/lib/ai/receipt-score.ts). Real API calls, real tokens.
 *
 *   npm run ai:eval                                   (Claude, fast model — what the app uses)
 *   RECEIPT_EVAL_MODELS=fast,smart npm run ai:eval    (compare tiers)
 *   AI_PROVIDER=openai npm run ai:eval                (another provider)
 *
 * Set: evals/receipts/ (gitignored) holds the PDFs/images, ground-truth.json and context.txt
 * (the category + merchant list the app sends). Override with RECEIPT_EVAL_DIR.
 * Writes report-<provider>-<model>.json next to the set and prints the summary.
 */
const dir = process.env.RECEIPT_EVAL_DIR ?? "evals/receipts";
const truthFile = path.join(dir, "ground-truth.json");
const run = existsSync(truthFile) ? it : it.skip;
const provider = (process.env.AI_PROVIDER as Exclude<AiProvider, "mock">) || "claude";
const tiers = (process.env.RECEIPT_EVAL_MODELS ?? "fast").split(",").map((s) => s.trim()) as AiTier[];
const MIME: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } }));
  return out;
}

for (const tier of tiers) {
  run(`receipt eval: ${provider} ${tier}`, { timeout: 900_000 }, async () => {
    const cfg = resolveAiConfig({ ...process.env, AI_PROVIDER: provider });
    expect(cfg.key, `${cfg.label} key missing in .env.local`).toBeTruthy();
    const { model, modelId } = getModel(tier, cfg);
    const truth: ReceiptTruth[] = JSON.parse(readFileSync(truthFile, "utf8"));
    const context = existsSync(path.join(dir, "context.txt")) ? readFileSync(path.join(dir, "context.txt"), "utf8") : "Expense categories:\n- Groceries (expense)\n- Shopping (expense)";

    const runs = await pool(truth, 4, async (t): Promise<RunResult & { file: string; extraction?: unknown }> => {
      const started = Date.now();
      try {
        const r = await callModel({
          cfg,
          model,
          system: receiptSystem("USD", process.env.RECEIPT_EVAL_TODAY ?? new Date().toISOString().slice(0, 10)),
          input: { text: context, files: [{ data: new Uint8Array(readFileSync(path.join(dir, t.file))), mediaType: MIME[path.extname(t.file).toLowerCase()] }] },
          schema: receiptSchema,
          timeoutMs: 120_000,
        });
        return { file: t.file, score: scoreReceipt(t, toExtraction(r.data)), error: null, ms: Date.now() - started, tokensIn: r.tokensIn, tokensOut: r.tokensOut, extraction: r.data };
      } catch (e) {
        return { file: t.file, score: null, error: e instanceof Error ? e.message : String(e), ms: Date.now() - started, tokensIn: null, tokensOut: null };
      }
    });

    const summary = summarise(runs);
    const report = { provider, model: modelId, tier, ranAt: new Date().toISOString(), summary, runs };
    writeFileSync(path.join(dir, `report-${provider}-${modelId}.json`), JSON.stringify(report, null, 1));

    console.log(`\n=== ${cfg.label} ${modelId} (${tier}) on ${runs.length} receipts ===`);
    console.table(
      runs.map((r) => ({
        receipt: r.file.replace(/\.pdf$/, "").slice(0, 40),
        RRS: r.score?.score ?? "ERR",
        ready: r.score?.ready ? "yes" : "no",
        total: r.score?.fields.total ? "✓" : "✗",
        date: r.score?.fields.date ? "✓" : "✗",
        merchant: r.score?.fields.merchant ? "✓" : "✗",
        items: r.score ? `${r.score.items.matched}/${r.score.items.expected} (+${r.score.extra.length})` : r.error?.slice(0, 40),
        sec: (r.ms / 1000).toFixed(1),
      })),
    );
    console.log(summary);
    expect(summary.receipts).toBe(truth.length);
  });
}
