/** One or two capital letters for a name: "Whole Foods" → "WF", "uber" → "U", "7-Eleven" → "7". Empty or symbol-only names give "·". */
export function monogram(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/[\s\-_/&.]+/).filter(Boolean);
  const letters = words.map((w) => Array.from(w).find((ch) => /[\p{L}\p{N}]/u.test(ch)) ?? "").filter(Boolean);
  if (!letters.length) return "·";
  return (letters.length === 1 ? letters[0] : letters[0] + letters[1]).toUpperCase();
}
