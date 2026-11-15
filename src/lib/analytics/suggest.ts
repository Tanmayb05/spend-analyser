export type SuggestItem =
  | { kind: "merchant"; id: string; text: string }
  | { kind: "description"; text: string };

type Entry = { item: SuggestItem; lower: string };

export type SuggestIndex = { merchants: Entry[]; descriptions: Entry[] };

/** In-memory search index: lowercased once so each keystroke only does cheap string checks. */
export function buildSuggestIndex(merchants: { id: string; name: string }[], descriptions: string[]): SuggestIndex {
  const seenM = new Set<string>();
  const m: Entry[] = [];
  for (const x of merchants) {
    const lower = x.name.trim().toLowerCase();
    if (!lower || seenM.has(lower)) continue;
    seenM.add(lower);
    m.push({ item: { kind: "merchant", id: x.id, text: x.name.trim() }, lower });
  }
  const d: Entry[] = [];
  const seenD = new Set<string>(seenM); // a description identical to a merchant name adds nothing
  for (const raw of descriptions) {
    const text = raw.trim();
    const lower = text.toLowerCase();
    if (!lower || seenD.has(lower)) continue;
    seenD.add(lower);
    d.push({ item: { kind: "description", text }, lower });
  }
  return { merchants: m, descriptions: d };
}

/** 0 = prefix, 1 = word start, 2 = substring, null = no match. */
function rank(lower: string, q: string): number | null {
  const i = lower.indexOf(q);
  if (i < 0) return null;
  if (i === 0) return 0;
  return /[\s\-_/.,()&]/.test(lower[i - 1]) ? 1 : 2;
}

function top(entries: Entry[], q: string, limit: number): SuggestItem[] {
  const hits: { item: SuggestItem; r: number; len: number }[] = [];
  for (const e of entries) {
    const r = rank(e.lower, q);
    if (r !== null) hits.push({ item: e.item, r, len: e.lower.length });
  }
  hits.sort((a, b) => a.r - b.r || a.len - b.len || a.item.text.localeCompare(b.item.text));
  return hits.slice(0, limit).map((h) => h.item);
}

/** Merchants first, then descriptions; best matches first within each group. Total capped at `limit`. */
export function suggest(index: SuggestIndex, query: string, limit = 8): SuggestItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const merchants = top(index.merchants, q, limit);
  // keep room for descriptions when merchants alone would fill the list
  const mTake = Math.min(merchants.length, Math.max(limit - 3, Math.ceil(limit / 2)));
  const descriptions = top(index.descriptions, q, limit - mTake);
  const mFinal = merchants.slice(0, Math.max(mTake, limit - descriptions.length));
  return [...mFinal, ...descriptions].slice(0, limit);
}
