import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * twMerge knows only Tailwind's own scale. The project tokens in globals.css (@theme static) have to be
 * registered here, otherwise `cn("p-card", "p-0")` keeps both classes and the override silently loses.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: ["compact", "card", "card-lg", "page", "page-lg"],
      radius: ["control", "inset", "card", "panel"],
      text: ["label"],
      shadow: ["pop"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sum<T>(rows: T[], pick: (r: T) => number): number {
  return round2(rows.reduce((acc, r) => acc + pick(r), 0));
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function groupBy<T, K extends string | number>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}
