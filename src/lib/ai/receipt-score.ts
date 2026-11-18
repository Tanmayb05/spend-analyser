import type { ReceiptExtraction } from "./schemas";

/**
 * Receipt Read Score (RRS): how well one extraction matches a hand-labelled receipt, 0–100.
 *
 *   Header 50 pts: total 25 · date 10 · merchant 10 · tax 5   (a field labelled null-skip is left out and the rest rescaled)
 *   Items  50 pts: F1 of line items, matched one-to-one by line total (±1¢)
 *
 * "Ready to save" = total, date and merchant right AND item F1 ≥ 0.95: the user would not need to edit anything.
 * Optional items (unavailable / returned lines) never count for or against.
 */
export type TruthItem = { name: string; price: number; optional?: boolean };
export type ReceiptTruth = {
  file: string;
  /** accepted merchant keys (lowercase, matched as substring either way); null = "no merchant" is also right */
  merchant: (string | null)[];
  /** null = no date printed, so the right answer is null */
  date: string | null;
  /** accepted totals (some receipts are ambiguous, e.g. two orders on one screenshot) */
  total: number[];
  /** null = not printed / not checkable: skipped */
  tax: number | null;
  items: TruthItem[];
  hard?: boolean;
};

export type ReceiptScore = {
  file: string;
  score: number;
  ready: boolean;
  fields: { total: boolean; date: boolean; merchant: boolean; tax: boolean | null };
  items: { expected: number; got: number; matched: number; precision: number; recall: number; f1: number; namesOk: number };
  /** the numbers add up (items + tax ≈ total allowing a small fee, or items (+ discounts) ≈ subtotal): checkable with no labels */
  consistent: boolean;
  missing: TruthItem[];
  extra: { name: string; price: number }[];
};

const CENT = 0.011;
const key = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const near = (a: number | null | undefined, b: number) => a != null && Math.abs(a - b) < CENT;

function merchantOk(got: string | null, accepted: (string | null)[]) {
  const g = key(got);
  if (!g) return accepted.includes(null);
  return accepted.some((a) => a != null && (g.includes(key(a)) || key(a).includes(g)));
}

/** a matched line also has a recognisable name: any 4+ letter word of the label appears in what was read */
function nameOk(label: string, got: string) {
  const words = label.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  const g = got.toLowerCase();
  return words.length === 0 || words.some((w) => g.includes(w));
}

export function isConsistent(x: ReceiptExtraction) {
  const sum = x.items.reduce((a, i) => a + i.total_price, 0);
  const tol = (n: number) => Math.max(0.5, Math.abs(n) * 0.02);
  if (x.total != null) {
    const gap = x.total - (sum + (x.tax ?? 0));
    // exact, or short by a delivery / service fee the schema has no field for (≤ $5)
    if (Math.abs(gap) <= tol(x.total) || (gap > 0 && gap <= 5)) return true;
  }
  // line totals are after line discounts; the printed subtotal is often before them
  if (x.subtotal != null && [sum, sum + (x.discount ?? 0)].some((s) => Math.abs(s - x.subtotal!) <= tol(x.subtotal!))) return true;
  return x.items.length === 0 && x.total != null;
}

export function scoreReceipt(truth: ReceiptTruth, got: ReceiptExtraction): ReceiptScore {
  // header
  const fields = {
    total: truth.total.some((t) => near(got.total, t)),
    date: (got.date ?? null) === truth.date,
    merchant: merchantOk(got.merchant, truth.merchant),
    tax: truth.tax == null ? null : near(got.tax ?? 0, truth.tax),
  };
  const weights: [boolean | null, number][] = [
    [fields.total, 25],
    [fields.date, 10],
    [fields.merchant, 10],
    [fields.tax, 5],
  ];
  const counted = weights.filter(([ok]) => ok !== null);
  const header = (50 * counted.reduce((a, [ok, w]) => a + (ok ? w : 0), 0)) / counted.reduce((a, [, w]) => a + w, 0);

  // items: greedy one-to-one match on price, preferring a line whose name also fits
  const pool = truth.items.map((t) => ({ ...t, used: false }));
  const extra: { name: string; price: number }[] = [];
  let matched = 0;
  let namesOk = 0;
  for (const it of got.items) {
    const cands = pool.filter((t) => !t.used && near(it.total_price, t.price));
    const hit = cands.find((t) => nameOk(t.name, it.raw_name)) ?? cands[0];
    if (!hit) {
      extra.push({ name: it.raw_name, price: it.total_price });
      continue;
    }
    hit.used = true;
    if (hit.optional) continue;
    matched++;
    if (nameOk(hit.name, it.raw_name)) namesOk++;
  }
  const expected = truth.items.filter((t) => !t.optional).length;
  const gotCounted = matched + extra.length;
  const precision = gotCounted === 0 ? 1 : matched / gotCounted;
  const recall = expected === 0 ? 1 : matched / expected;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  const score = Math.round((header + 50 * f1) * 10) / 10;
  return {
    file: truth.file,
    score,
    ready: fields.total && fields.date && fields.merchant && f1 >= 0.95,
    fields,
    items: { expected, got: got.items.length, matched, precision, recall, f1, namesOk },
    consistent: isConsistent(got),
    missing: pool.filter((t) => !t.used && !t.optional).map(({ name, price }) => ({ name, price })),
    extra,
  };
}

export type RunResult = { score: ReceiptScore | null; error: string | null; ms: number; tokensIn: number | null; tokensOut: number | null };

export function summarise(runs: RunResult[]) {
  const ok = runs.filter((r): r is RunResult & { score: ReceiptScore } => r.score !== null);
  const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((1000 * n) / d) / 10);
  const tax = ok.filter((r) => r.score.fields.tax !== null);
  const sum = (f: (r: (typeof ok)[number]) => number) => ok.reduce((a, r) => a + f(r), 0);
  const expected = sum((r) => r.score.items.expected);
  const matched = sum((r) => r.score.items.matched);
  const extra = sum((r) => r.score.extra.length);
  const latencies = runs.map((r) => r.ms).sort((a, b) => a - b);
  return {
    receipts: runs.length,
    failed: runs.length - ok.length,
    /** headline metric: mean Receipt Read Score, failed calls score 0 */
    rrs: Math.round((10 * sum((r) => r.score.score)) / Math.max(1, runs.length)) / 10,
    readyPct: pct(ok.filter((r) => r.score.ready).length, runs.length),
    totalPct: pct(ok.filter((r) => r.score.fields.total).length, runs.length),
    datePct: pct(ok.filter((r) => r.score.fields.date).length, runs.length),
    merchantPct: pct(ok.filter((r) => r.score.fields.merchant).length, runs.length),
    taxPct: pct(tax.filter((r) => r.score.fields.tax).length, tax.length),
    itemRecallPct: pct(matched, expected),
    itemPrecisionPct: pct(matched, matched + extra),
    itemNamePct: pct(sum((r) => r.score.items.namesOk), matched),
    inventedItems: extra,
    consistentPct: pct(ok.filter((r) => r.score.consistent).length, runs.length),
    p50ms: latencies[Math.floor(latencies.length / 2)] ?? 0,
    p95ms: latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] ?? 0,
    tokensIn: runs.reduce((a, r) => a + (r.tokensIn ?? 0), 0),
    tokensOut: runs.reduce((a, r) => a + (r.tokensOut ?? 0), 0),
  };
}
