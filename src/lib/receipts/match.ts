import { round2 } from "@/lib/utils";

export type TxnCandidate = {
  id: string;
  date: string;
  amount: number;
  currency: string;
  merchant: string | null;
  payment_method_id: string | null;
  receipt_id: string | null;
  type: "expense" | "income" | "refund";
  /** names saved against the transaction's merchant (a receipt may call the same shop something else) */
  aliases?: string[];
};

export type ReceiptTarget = {
  date: string | null;
  total: number;
  /** printed total plus a tip read from the receipt; the exact target when present */
  total_paid: number | null;
  currency: string;
  merchant: string | null;
  payment_method_id: string | null;
  order_type: "in_store" | "delivery" | "pickup" | "online" | null;
};

export type Candidate = { txn: TxnCandidate; score: number; reasons: string[] };

export const DAY_MS = 86_400_000;
export const daysBetween = (a: string, b: string) => Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / DAY_MS);

/** Name used to compare merchants: lowercase letters only, so "KROGER #123" and "Kroger" meet. */
export const normMerchant = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "");

export function sameMerchant(a: string | null | undefined, b: string | null | undefined, aliases: string[] = []): boolean {
  const x = normMerchant(a);
  if (!x) return false;
  for (const other of [b, ...aliases]) {
    const y = normMerchant(other);
    if (!y) continue;
    if (x === y) return true;
    if (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))) return true;
  }
  return false;
}

export const windowDays = (t: Pick<ReceiptTarget, "order_type">) => (t.order_type === "online" || t.order_type === "delivery" ? 14 : 7);

const near = (a: number, b: number) => Math.abs(a - b) <= 0.011;

/**
 * Rank unlinked transactions that could be this receipt. Nothing links on its own; the caller shows the list.
 * Amount band: the receipt total up to 130% of it (a tip), `total_paid` exact when a tip was read. For online and
 * delivery orders a smaller transaction also qualifies (one shipment of a split order).
 */
export function rankCandidates(r: ReceiptTarget, txns: TxnCandidate[], opts: { limit?: number; exclude?: Set<string> } = {}): Candidate[] {
  const win = windowDays(r);
  const split = win === 14;
  const out: Candidate[] = [];
  for (const t of txns) {
    if (t.type !== "expense" || t.receipt_id || opts.exclude?.has(t.id)) continue;
    const reasons: string[] = [];
    let score = 0;

    if (r.date) {
      const d = daysBetween(r.date, t.date);
      if (d > win) continue;
      score += Math.max(5, 20 - d * 2);
      reasons.push(d === 0 ? "same day" : `${d} day${d === 1 ? "" : "s"} apart`);
    }

    const sameCurrency = t.currency === r.currency;
    if (sameCurrency) {
      score += 5;
      if (r.total_paid != null && near(t.amount, r.total_paid)) {
        score += 60;
        reasons.push("same amount");
      } else if (near(t.amount, r.total)) {
        score += 50;
        reasons.push("same amount");
      } else if (t.amount > r.total && t.amount <= round2(r.total * 1.3)) {
        score += 25;
        reasons.push("amount includes a tip");
      } else if (split && t.amount < r.total) {
        score += 10;
        reasons.push("part of the order");
      } else continue;
    } else {
      reasons.push("different currency");
    }

    if (sameMerchant(r.merchant, t.merchant, t.aliases)) {
      score += 25;
      reasons.push("same merchant");
    }
    if (r.payment_method_id && t.payment_method_id === r.payment_method_id) {
      score += 20;
      reasons.push("same card");
    }
    // a different currency with no merchant to go on is noise
    if (!sameCurrency && !reasons.includes("same merchant")) continue;
    out.push({ txn: t, score, reasons });
  }
  out.sort((a, b) => b.score - a.score || Math.abs(Date.parse(a.txn.date) - Date.parse(r.date ?? a.txn.date)) - Math.abs(Date.parse(b.txn.date) - Date.parse(r.date ?? b.txn.date)));
  return out.slice(0, opts.limit ?? 6);
}

/** Broader suggestions when the strict list is empty: same merchant (any amount) or same card nearby. */
export function broaderSuggestions(r: ReceiptTarget, txns: TxnCandidate[], opts: { limit?: number; exclude?: Set<string> } = {}): Candidate[] {
  const out: Candidate[] = [];
  for (const t of txns) {
    if (t.type !== "expense" || t.receipt_id || opts.exclude?.has(t.id)) continue;
    const d = r.date ? daysBetween(r.date, t.date) : 0;
    const merchant = sameMerchant(r.merchant, t.merchant, t.aliases);
    const card = !!r.payment_method_id && t.payment_method_id === r.payment_method_id;
    if (merchant && d <= 30) out.push({ txn: t, score: 30 - d, reasons: ["same merchant", `${d} days apart`] });
    else if (card && d <= 7) out.push({ txn: t, score: 10 - d, reasons: ["same card", `${d} days apart`] });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, opts.limit ?? 6);
}

/** How much of a receipt's total linked transactions cover (same currency only). */
export function matchedSoFar(total: number, linked: { amount: number }[]): { matched: number; remaining: number; complete: boolean } {
  const matched = round2(linked.reduce((a, t) => a + t.amount, 0));
  const remaining = round2(total - matched);
  return { matched, remaining: Math.max(0, remaining), complete: remaining <= 0.011 };
}
