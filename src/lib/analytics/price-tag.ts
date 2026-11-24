/** Pure shaping for the shelf price tag on the Items page: latest price, change vs the previous purchase, sparkline. */

/** A move smaller than this (1%) reads as "unchanged". */
export const FLAT_THRESHOLD = 0.01;
/** The sparkline shows at most the latest this many purchases. */
export const SPARK_MAX = 12;

export type TagPoint = { date: string | null; price: number; merchant?: string | null };
export type TagDirection = "up" | "down" | "flat";

export type PriceTagData = {
  current: number;
  previous: number | null;
  /** Ratio vs the previous purchase (0.12 = +12%); null with fewer than two purchases or a zero previous price. */
  change: number | null;
  /** null when there is nothing to compare against. */
  direction: TagDirection | null;
  /** Unit prices, oldest to newest, capped to the latest SPARK_MAX. */
  history: number[];
  lastDate: string | null;
  lastMerchant: string | null;
  count: number;
};

/** Oldest first; undated purchases sort before dated ones; ties keep their input order. */
export function sortPoints(points: TagPoint[]): TagPoint[] {
  return points
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (a.p.date ?? "").localeCompare(b.p.date ?? "") || a.i - b.i)
    .map((x) => x.p);
}

export function directionOf(change: number | null): TagDirection | null {
  if (change == null || !Number.isFinite(change)) return null;
  return Math.abs(change) < FLAT_THRESHOLD ? "flat" : change > 0 ? "up" : "down";
}

/** Shape one item's purchases (any order) into what the tag shows. Null for an item with no purchases. */
export function shapePriceTag(points: TagPoint[]): PriceTagData | null {
  const sorted = sortPoints(points);
  const last = sorted.at(-1);
  if (!last) return null;
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const change = prev && prev.price > 0 ? (last.price - prev.price) / prev.price : null;
  return {
    current: last.price,
    previous: prev ? prev.price : null,
    change,
    direction: directionOf(change),
    history: sorted.slice(-SPARK_MAX).map((p) => p.price),
    lastDate: last.date,
    lastMerchant: last.merchant ?? null,
    count: sorted.length,
  };
}

/**
 * Sparkline coordinates inside a w x h box with `pad` on every side, y flipped so a higher price sits higher.
 * Fewer than two prices give no line; a flat series is drawn mid-height.
 */
export function sparkPoints(prices: number[], w: number, h: number, pad = 2): { x: number; y: number }[] {
  if (prices.length < 2) return [];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min;
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  return prices.map((v, i) => ({
    x: round1(pad + (i / (prices.length - 1)) * iw),
    y: round1(span === 0 ? h / 2 : pad + (1 - (v - min) / span) * ih),
  }));
}

export function sparkPath(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
}

const round1 = (n: number) => Math.round(n * 10) / 10;
