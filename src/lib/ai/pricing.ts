/**
 * List prices in USD per 1M tokens, used to stamp a cost on every logged AI call.
 * Checked 2026-11-18. Update when a provider changes prices; old log rows keep the cost they were logged with.
 *
 *   cacheRead / cacheWrite: price for cached prompt tokens read / written (defaults: read = input, write = input).
 *   long: higher rates once a single request's input passes `over` tokens.
 *   Reasoning tokens are billed as output and are already inside the output count.
 */
export type ModelPrice = {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  long?: { over: number; input: number; output: number };
};

export const PRICES: Record<string, ModelPrice> = {
  // Claude: cache writes are 1.25x input (5-minute cache)
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125, long: { over: 100_000, input: 0.5, output: 2.5 } },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  // Gemini
  "gemini-2.5-flash": { input: 0.3, output: 2.5, cacheRead: 0.03 },
  "gemini-2.5-pro": { input: 1.25, output: 10, cacheRead: 0.125, long: { over: 200_000, input: 2.5, output: 15 } },
  // OpenAI
  "gpt-5.4-mini": { input: 0.75, output: 4.5, cacheRead: 0.075 },
  "gpt-5.5": { input: 5, output: 30, cacheRead: 0.5 },
  // fixtures, free
  "mock-fast": { input: 0, output: 0 },
  "mock-smart": { input: 0, output: 0 },
};

/** Exact id first, then the longest known id the model starts with (e.g. "gemini-2.5-flash-001"). */
export function priceFor(model: string | null | undefined, table: Record<string, ModelPrice> = PRICES): ModelPrice | null {
  if (!model) return null;
  if (table[model]) return table[model];
  const prefix = Object.keys(table)
    .filter((k) => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? table[prefix] : null;
}

/** Token counts for one call. `input` is the total prompt, including cached parts. */
export type TokenUsage = {
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  reasoning: number | null;
};

/** Dollar cost of one call, or null when the model has no price or no token counts. */
export function costUsd(model: string | null | undefined, u: TokenUsage, table: Record<string, ModelPrice> = PRICES): number | null {
  const p = priceFor(model, table);
  if (!p || (u.input == null && u.output == null)) return null;
  const input = u.input ?? 0;
  const read = u.cacheRead ?? 0;
  const write = u.cacheWrite ?? 0;
  const fresh = Math.max(0, input - read - write);
  const long = p.long && input > p.long.over ? p.long : null;
  const inRate = long?.input ?? p.input;
  const outRate = long?.output ?? p.output;
  const usd = (fresh * inRate + read * (p.cacheRead ?? inRate) + write * (p.cacheWrite ?? inRate) + (u.output ?? 0) * outRate) / 1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}
