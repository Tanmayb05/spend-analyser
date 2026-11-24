import { parseISO } from "@/lib/dates";

/** Small stable string hash (FNV-1a, 32-bit). Same input, same number, on server and client. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A trip has ended once its own end date is before today. Trips without an end date never count as ended. */
export function isTripEnded(endDate: string | null | undefined, today: string): boolean {
  return Boolean(endDate) && endDate!.slice(0, 10) < today;
}

/** Fixed tilt for a trip's stamp, from -4 to +4 degrees in half-degree steps. */
export function stampRotation(id: string): number {
  return ((hashString(id) % 17) - 8) / 2;
}

/** Chart token number (1 to 8) that inks a trip's stamp. */
export function stampColorIndex(id: string): number {
  return 1 + (hashString(`ink:${id}`) % 8);
}

/** Shorten a trip name to fit on the stamp: whitespace collapsed, cut at a word boundary where possible, ending in an ellipsis. */
export function shortenLabel(name: string, max = 18): string {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  const base = space >= Math.floor(max / 2) ? cut.slice(0, space) : cut;
  return `${base.trimEnd()}…`;
}

/** "Mar 2026" for the stamp's date line. */
export function stampDate(end: string): string {
  return parseISO(end).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** Font size (SVG units) that keeps a figure inside the stamp centre: full size for short text, shrinking for long ones. */
export function fitFontSize(text: string, max = 22, width = 100): number {
  return Math.max(10, Math.min(max, width / Math.max(1, text.length * 0.6)));
}
