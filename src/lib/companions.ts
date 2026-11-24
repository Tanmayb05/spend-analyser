import { monogram } from "@/lib/monogram";
import { hashString } from "@/lib/trip-stamp";

export type Companion = { name: string; initials: string; /** chart token number 1..8 */ color: number };

/** Split the free-text "With" field into names: commas, semicolons, "&", "+" and the word "and" all separate people. Duplicates are dropped. */
export function splitCompanions(text: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (text ?? "").split(/,|;|&|\+|\s+and\s+/i)) {
    const name = raw.trim().replace(/\s+/g, " ");
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** Up to `max` people with initials and a stable chart colour each, plus how many more there are. */
export function companionStack(text: string | null | undefined, max = 4): { shown: Companion[]; extra: number; all: string[] } {
  const all = splitCompanions(text);
  const shown = all.slice(0, max).map((name) => ({ name, initials: monogram(name), color: 1 + (hashString(name.toLowerCase()) % 8) }));
  return { shown, extra: Math.max(0, all.length - max), all };
}
