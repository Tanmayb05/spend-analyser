/**
 * Pure helpers for the AI tidy-up features: pick what to send, build the prompt, and turn the model's
 * answer back into validated changes. No I/O here so every rule is unit-tested.
 * The model only ever sees row numbers and names; ids stay on the server.
 */
import type { Category, Subcategory } from "@/lib/data/types";
import type { AnomalyExplanations, Categorized, ItemNames, MerchantCleanup } from "./schemas";

const lc = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Category names that mean "not really categorised". */
export const CATCH_ALL = /^(other|others|other expenses?|misc|miscellaneous|uncategori[sz]ed( income)?|general|unknown|none)$/i;

function categoryLines(cats: Category[], subs: Subcategory[], kinds: Array<"expense" | "income">) {
  return cats
    .filter((c) => !c.archived && kinds.includes(c.kind) && !CATCH_ALL.test(c.name.trim()))
    .map((c) => {
      const s = subs.filter((x) => x.category_id === c.id && !x.archived).map((x) => x.name);
      return `- ${c.name} (${c.kind})${s.length ? `: ${s.join(", ")}` : ""}`;
    })
    .join("\n");
}

function findCategory(cats: Category[], subs: Subcategory[], name: string | null, subName: string | null, kind: "expense" | "income") {
  const c = cats.find((x) => !x.archived && x.kind === kind && lc(x.name) === lc(name) && !CATCH_ALL.test(x.name.trim()));
  if (!c) return null;
  const s = subs.find((x) => x.category_id === c.id && !x.archived && lc(x.name) === lc(subName));
  return { category_id: c.id, subcategory_id: s?.id ?? null };
}

const kindOf = (type: string): "expense" | "income" => (type === "income" ? "income" : "expense");

// ---------------------------------------------------------------------------
// Categorise
// ---------------------------------------------------------------------------
export type CatRow = {
  id: string;
  date: string;
  type: "expense" | "income" | "refund";
  amount: number;
  currency: string;
  description: string | null;
  merchant: string | null;
  category_id: string;
  subcategory_id: string | null;
};

/** Sitting in a catch-all category, or missing a subcategory where the category has some. */
export function needsCategory(row: CatRow, cats: Category[], subs: Subcategory[]) {
  const c = cats.find((x) => x.id === row.category_id);
  if (!c) return false;
  if (CATCH_ALL.test(c.name.trim())) return true;
  return !row.subcategory_id && subs.some((s) => s.category_id === c.id && !s.archived);
}

export const pickCategorizeCandidates = (rows: CatRow[], cats: Category[], subs: Subcategory[], limit = 50) =>
  rows.filter((r) => needsCategory(r, cats, subs)).slice(0, limit);

export function categorizePrompt(rows: CatRow[], cats: Category[], subs: Subcategory[]) {
  const name = (id: string) => cats.find((c) => c.id === id)?.name ?? "?";
  const lines = rows.map(
    (r, i) => `${i}. ${r.date} | ${r.type} | ${r.amount} ${r.currency} | merchant: ${r.merchant ?? "-"} | description: ${r.description ?? "-"} | now: ${name(r.category_id)}`,
  );
  return `Categories:\n${categoryLines(cats, subs, ["expense", "income"])}\n\nRows:\n${lines.join("\n")}`;
}

export type CategorySuggestion = {
  id: string;
  row: CatRow;
  category_id: string;
  subcategory_id: string | null;
  confidence: "high" | "medium" | "low";
};

/** Valid, changing suggestions only. Unknown names, wrong kind (income vs expense) and catch-alls are dropped. */
export function mapCategorized(result: Categorized, rows: CatRow[], cats: Category[], subs: Subcategory[]): CategorySuggestion[] {
  const seen = new Set<number>();
  const out: CategorySuggestion[] = [];
  for (const s of result.categorized) {
    const row = rows[s.i];
    if (!row || seen.has(s.i)) continue;
    seen.add(s.i);
    const m = findCategory(cats, subs, s.category, s.subcategory, kindOf(row.type));
    if (!m) continue;
    if (m.category_id === row.category_id && (m.subcategory_id ?? null) === (row.subcategory_id ?? null)) continue;
    if (m.category_id === row.category_id && !m.subcategory_id) continue; // nothing gained
    out.push({ id: row.id, row, ...m, confidence: s.confidence });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Merchants
// ---------------------------------------------------------------------------
export type MerchantIn = { id: string; name: string; default_category_id: string | null; count: number; usualCategory: string | null };

export function merchantsPrompt(rows: MerchantIn[], cats: Category[], subs: Subcategory[]) {
  const name = (id: string | null) => (id ? (cats.find((c) => c.id === id)?.name ?? "-") : "none");
  const lines = rows.map((m) => `- ${m.name} | ${m.count} txns | default: ${name(m.default_category_id)} | usually: ${m.usualCategory ?? "-"}`);
  return `Expense categories:\n${categoryLines(cats, subs, ["expense"])}\n\nMerchants:\n${lines.join("\n")}`;
}

export type MerchantGroup = {
  canonical: string;
  /** Existing merchant that already has the canonical name (kept); null = rename the first member. */
  targetId: string | null;
  members: { id: string; name: string }[];
  category_id: string | null;
  subcategory_id: string | null;
};

export function planMerchantFixes(
  result: MerchantCleanup,
  merchants: { id: string; name: string; default_category_id: string | null }[],
  cats: Category[],
  subs: Subcategory[],
): MerchantGroup[] {
  const byKey = new Map(merchants.map((m) => [lc(m.name), m]));
  const groups = new Map<string, MerchantGroup>();
  const used = new Set<string>();
  for (const f of result.merchant_fixes) {
    const m = byKey.get(lc(f.name));
    if (!m || used.has(m.id)) continue;
    used.add(m.id);
    const rename = (f.rename_to ?? "").trim().slice(0, 120);
    const canonical = rename || m.name;
    const key = lc(canonical);
    const g = groups.get(key) ?? { canonical, targetId: byKey.get(key)?.id ?? null, members: [], category_id: null, subcategory_id: null };
    g.members.push({ id: m.id, name: m.name });
    if (!g.category_id && !m.default_category_id && f.category) {
      const c = findCategory(cats, subs, f.category, f.subcategory, "expense");
      if (c) Object.assign(g, c);
    }
    groups.set(key, g);
  }
  return [...groups.values()].filter((g) => {
    const target = g.targetId ? merchants.find((m) => m.id === g.targetId) : null;
    const merges = g.members.filter((m) => m.id !== (g.targetId ?? g.members[0].id)).length;
    const renames = !g.targetId && g.members[0].name !== g.canonical;
    const sets = Boolean(g.category_id) && !(target ?? merchants.find((m) => m.id === g.members[0].id))?.default_category_id;
    if (!sets) {
      g.category_id = null;
      g.subcategory_id = null;
    }
    return merges > 0 || renames || sets;
  });
}

// ---------------------------------------------------------------------------
// Receipt item names
// ---------------------------------------------------------------------------
export type ItemRow = { id: string; raw_name: string; normalized_name: string | null; item_category: string | null };
export type ItemGroup = { ids: string[]; raw_name: string; normalized_name: string | null; item_category: string | null };

/** One entry per distinct printed name, so the same line on many receipts costs one row. */
export function groupItems(rows: ItemRow[], limit = 150): ItemGroup[] {
  const map = new Map<string, ItemGroup>();
  for (const r of rows) {
    const k = lc(r.raw_name);
    const g = map.get(k);
    if (g) g.ids.push(r.id);
    else if (map.size < limit) map.set(k, { ids: [r.id], raw_name: r.raw_name, normalized_name: r.normalized_name, item_category: r.item_category });
  }
  return [...map.values()];
}

export function itemsPrompt(groups: ItemGroup[], existing: string[]) {
  const lines = groups.map((g, i) => `${i}. printed: ${g.raw_name} | current name: ${g.normalized_name ?? "-"} | group: ${g.item_category ?? "-"}`);
  return `Existing product names:\n${existing.join(", ") || "none"}\n\nRows:\n${lines.join("\n")}`;
}

export type ItemSuggestion = { ids: string[]; raw_name: string; from: string | null; to: string; fromCategory: string | null; item_category: string; changed: boolean };

export function mapItemNames(result: ItemNames, groups: ItemGroup[]): ItemSuggestion[] {
  const seen = new Set<number>();
  const out: ItemSuggestion[] = [];
  for (const s of result.item_names) {
    const g = groups[s.i];
    const to = s.normalized_name.trim().slice(0, 120);
    const cat = s.item_category.trim().slice(0, 60);
    if (!g || seen.has(s.i) || !to) continue;
    seen.add(s.i);
    out.push({ ids: g.ids, raw_name: g.raw_name, from: g.normalized_name, to, fromCategory: g.item_category, item_category: cat, changed: to !== g.normalized_name || cat !== g.item_category });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Anomalies
// ---------------------------------------------------------------------------
export type AnomalyCandidate = {
  transaction_id: string;
  kind: string;
  related_id: string | null;
  date: string;
  amount: number;
  currency: string;
  category: string;
  merchant: string | null;
  description: string | null;
  typical: number | null;
  related_date: string | null;
  has_plan: boolean;
  trip: string | null;
};

export function anomalyPrompt(cands: AnomalyCandidate[]) {
  const lines = cands.map((c, i) =>
    [
      `${i}. ${c.kind === "duplicate" ? `possible duplicate of an entry on ${c.related_date}` : `unusually large (typical ${c.typical})`}`,
      `${c.date}`,
      `${c.amount} ${c.currency}`,
      `category: ${c.category}`,
      `merchant: ${c.merchant ?? "-"}`,
      `description: ${c.description ?? "-"}`,
      c.has_plan ? "spread/EMI plan: yes" : null,
      c.trip ? `trip: ${c.trip}` : null,
    ]
      .filter(Boolean)
      .join(" | "),
  );
  return `Rows:\n${lines.join("\n")}`;
}

export type FlagInsert = { transaction_id: string; related_id: string | null; kind: "duplicate" | "unusual"; reason: string; dismissed: boolean };

/** Every explained candidate is stored (cleared ones as dismissed) so it is never sent again. */
export function mapAnomalies(result: AnomalyExplanations, cands: AnomalyCandidate[]): FlagInsert[] {
  const seen = new Set<number>();
  const out: FlagInsert[] = [];
  for (const e of result.explanations) {
    const c = cands[e.i];
    if (!c || seen.has(e.i) || (c.kind !== "duplicate" && c.kind !== "unusual")) continue;
    seen.add(e.i);
    const reason = e.reason.trim().slice(0, 300) || (c.kind === "duplicate" ? "Looks like a duplicate." : "Larger than usual for this category.");
    out.push({ transaction_id: c.transaction_id, related_id: c.related_id, kind: c.kind, reason, dismissed: !e.flag });
  }
  return out;
}
