import type { Category } from "@/lib/data/types";

/** CSS color for a category: its palette slot (themed), or neutral. Color follows the entity, never rank. */
export function categoryColor(c?: Pick<Category, "color"> | null): string {
  return c?.color ? `var(--${c.color})` : "var(--c-other)";
}

export const SERIES = { spent: "var(--c1)", income: "var(--c3)" } as const;
