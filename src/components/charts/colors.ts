import type { Category } from "@/lib/data/types";

/** CSS color for a category: its palette slot (themed), or neutral. Color follows the entity, never rank. */
export function categoryColor(c?: Pick<Category, "color"> | null): string {
  return c?.color ? `var(--${c.color})` : "var(--c-other)";
}

export const SERIES = { spent: "var(--c1)", income: "var(--c3)" } as const;

/** Spent-bar color by accounting mode: Smoothed = blue, Cash flow = purple (both themed tokens). */
export const MODE_COLOR = { normalized: "var(--c1)", cash: "var(--c7)" } as const;
