/** Pure shaping for the "how this compares" strip on the transaction detail: this charge against earlier ones at the same merchant. */

/** Within this share of the comparison figure counts as the same amount. */
export const SAME_WITHIN = 0.01;
/** Within this share of the usual amount counts as in line with it. */
export const USUAL_WITHIN = 0.05;
/** How many earlier charges feed the average and the sparkline. */
export const HISTORY_MAX = 12;
export const SPARK_COUNT = 6;

export type PastCharge = { date: string; amount: number };
export type ContextTone = "good" | "warn" | "muted";
export type TxnContext = {
  headline: string;
  detail: string;
  tone: ContextTone;
  /** Amounts oldest to newest, ending with this charge; drives the sparkline. */
  spark: number[];
};

const within = (a: number, b: number, share: number) => b !== 0 && Math.abs(a - b) / Math.abs(b) < share;

/**
 * Compare a charge with the earlier ones at the same merchant (same kind of entry). `money` formats an amount.
 * Null when there is nothing earlier to compare with; the caller then says it is the first one.
 */
export function merchantContext(
  current: { amount: number; date: string; income?: boolean },
  history: PastCharge[],
  opts: { merchant: string; money: (n: number) => string },
): TxnContext | null {
  const prior = history
    .filter((h) => h.date <= current.date && Number.isFinite(h.amount))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, HISTORY_MAX);
  if (!prior.length) return null;

  const cur = Math.abs(current.amount);
  const amounts = prior.map((p) => Math.abs(p.amount));
  const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const spark = [...amounts.slice(0, SPARK_COUNT).reverse(), cur];
  const nouns = current.income ? ["payment", "payments"] : ["charge", "charges"];
  const count = `${amounts.length} earlier ${amounts.length === 1 ? nouns[0] : nouns[1]}`;

  if (amounts.slice(0, SPARK_COUNT).every((a) => within(cur, a, SAME_WITHIN))) {
    return {
      headline: amounts.length === 1 ? "Same as last time" : "Same every time",
      detail: `${count} at ${opts.merchant}, all ${opts.money(cur)}`,
      tone: "good",
      spark,
    };
  }

  const diff = cur - avg;
  const usual = `Average at ${opts.merchant}: ${opts.money(avg)} over ${count}`;
  if (within(cur, avg, USUAL_WITHIN) || Math.abs(diff) < 0.005) return { headline: "In line with your usual here", detail: usual, tone: "muted", spark };
  const up = diff > 0;
  // spending more is a warning, earning more is good news
  const good = current.income ? up : !up;
  return { headline: `${opts.money(Math.abs(diff))} ${up ? "above" : "below"} your usual here`, detail: usual, tone: good ? "good" : "warn", spark };
}
