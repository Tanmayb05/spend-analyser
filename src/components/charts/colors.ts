import type { Category } from "@/lib/data/types";

/** CSS color for a category: its palette slot (themed), or neutral. Color follows the entity, never rank. */
export function categoryColor(c?: Pick<Category, "color"> | null): string {
  return c?.color ? `var(--${c.color})` : "var(--c-other)";
}

export const SERIES = { spent: "var(--c1)", income: "var(--c3)" } as const;

/**
 * "One accent per chart": the series that matters takes ACCENT, the rest sit on the neutral steps (strong to quiet).
 * The categorical palette c1-c8 stays for charts that must tell many series apart (c7 is the one purple-ish slot, last in rotation).
 */
export const ACCENT = "var(--accent)";
export const NEUTRAL = { strong: "var(--chart-n1)", mid: "var(--chart-n2)", quiet: "var(--chart-muted)" } as const;

/** Trip costs are mostly Flights, Stay and Food, so those three always get their own fixed, distinct colors. */
const TRIP_FIXED: Record<string, string> = { flights: "var(--c1)", flight: "var(--c1)", stay: "var(--c2)", food: "var(--c3)" };
/** Everything else takes the remaining palette slots (c6, a green close to Food's c3, goes last), then falls back to neutral. */
const TRIP_ROTATION = ["var(--c4)", "var(--c5)", "var(--c7)", "var(--c8)", "var(--c6)"];

/**
 * One color per trip-spend label. `labels` should be sorted biggest first so the largest "other" parts get the most distinct slots.
 * Same label → same color, so the bar and legend always agree.
 */
export function tripPartColors(labels: string[]): Map<string, string> {
  const out = new Map<string, string>();
  let next = 0;
  for (const label of labels) {
    if (out.has(label)) continue;
    const fixed = TRIP_FIXED[label.trim().toLowerCase()];
    out.set(label, fixed ?? TRIP_ROTATION[next++] ?? "var(--c-other)");
  }
  return out;
}
