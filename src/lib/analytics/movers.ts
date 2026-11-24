import { round2 } from "@/lib/utils";

/** Pure shaping for the "What moved" card: steady vs moved, the bridge from the baseline to this month, and chart scales. */

type Mover = { spent: number; base: number; change: number | null };

/** Under this much movement (currency units), or under 5% of the baseline, a category counts as steady. */
export const STEADY_BELOW = 10;
export const STEADY_PCT = 0.05;
/** Below this baseline a percent is noise (5 to 25 is +400%), so the row shows only the amount. */
export const PCT_MIN_BASE = 20;

export const deltaOf = (c: Pick<Mover, "spent" | "base">) => round2(c.spent - c.base);

export function isSteady(c: Mover): boolean {
  return Math.abs(c.spent - c.base) < STEADY_BELOW || (c.change != null && Math.abs(c.change) < STEADY_PCT);
}

/** Moved categories (biggest change in money first) and the steady ones (biggest spend first). */
export function splitMovers<T extends Mover>(items: T[]): { moved: T[]; steady: T[] } {
  const moved = items.filter((c) => !isSteady(c)).sort((a, b) => Math.abs(deltaOf(b)) - Math.abs(deltaOf(a)));
  const steady = items.filter(isSteady).sort((a, b) => b.spent - a.spent);
  return { moved, steady };
}

/** A percent is only worth showing when the baseline is big enough for it to mean something. */
export const showsPercent = (c: Mover): boolean => c.change != null && c.base >= PCT_MIN_BASE;

/** Longest bar in a set, so every bar in the card shares one scale (0 to the largest figure). */
export const barMax = (values: number[]): number => Math.max(1, ...values);

/** Plain wording for "than usual", "than last month", "than in October 2025". */
export const thanPhrase = (baseLabel: string): string => (baseLabel === "usual" || baseLabel === "last month" ? `than ${baseLabel}` : `than in ${baseLabel}`);
