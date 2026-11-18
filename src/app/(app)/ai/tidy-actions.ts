"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { generateJson } from "@/lib/ai/generate";
import { categorizeSchema, itemNamesSchema, merchantCleanupSchema } from "@/lib/ai/schemas";
import { categorizeSystem, itemNamesSystem, merchantsSystem } from "@/lib/ai/prompts";
import {
  categorizePrompt,
  groupItems,
  itemsPrompt,
  mapCategorized,
  mapItemNames,
  merchantsPrompt,
  pickCategorizeCandidates,
  planMerchantFixes,
  type CatRow,
  type ItemSuggestion,
  type MerchantGroup,
} from "@/lib/ai/tidy";

/**
 * AI tidy-up (Settings → AI tidy-up). Each "suggest" spends one tidy-up run and writes nothing;
 * each "apply" writes only what the user ticked, then marks every row that was sent as checked
 * so the next run never re-sends it.
 */

type Fail = { ok: false; error: string };
const failOf = (e: unknown): Fail => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const uuid = z.string().uuid();
const chunks = <T,>(a: T[], n = 200) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function lookups() {
  const { supabase } = await requireUser();
  const [cats, subs] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order"),
    supabase.from("subcategories").select("*").order("sort_order"),
  ]);
  return { supabase, cats: cats.data ?? [], subs: subs.data ?? [] };
}

// ---------------------------------------------------------------------------
// Categorise transactions
// ---------------------------------------------------------------------------
export type CategorizeRow = {
  id: string;
  date: string;
  label: string;
  amount: number;
  currency: string;
  from: string;
  to: string;
  category_id: string;
  subcategory_id: string | null;
  confidence: "high" | "medium" | "low";
};

async function categorizeCandidates() {
  const { supabase, cats, subs } = await lookups();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, date, type, amount, currency, description, category_id, subcategory_id, merchants(name)")
    .eq("category_checked", false)
    .order("date", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);
  const rows: CatRow[] = (data ?? []).map((r) => ({ ...r, amount: Number(r.amount), merchant: (r.merchants as { name: string } | null)?.name ?? null }));
  return { supabase, cats, subs, rows: pickCategorizeCandidates(rows, cats, subs, Number.MAX_SAFE_INTEGER) };
}

export async function countCategorizeCandidates(): Promise<number> {
  return (await categorizeCandidates()).rows.length;
}

export async function suggestCategoriesAction(): Promise<{ ok: true; rows: CategorizeRow[]; checkedIds: string[]; remaining: number | null } | Fail> {
  try {
    const { cats, subs, rows: all } = await categorizeCandidates();
    const rows = all.slice(0, 50);
    if (!rows.length) return { ok: true, rows: [], checkedIds: [], remaining: null };
    const { data, remaining } = await generateJson({ feature: "categorize", system: categorizeSystem(), input: { text: categorizePrompt(rows, cats, subs) }, schema: categorizeSchema });
    const path = (cid: string, sid: string | null) => {
      const c = cats.find((x) => x.id === cid)?.name ?? "?";
      const s = sid ? subs.find((x) => x.id === sid)?.name : null;
      return s ? `${c} › ${s}` : c;
    };
    const out = mapCategorized(data, rows, cats, subs).map((s) => ({
      id: s.id,
      date: s.row.date,
      label: s.row.merchant || s.row.description || "(no description)",
      amount: s.row.amount,
      currency: s.row.currency,
      from: path(s.row.category_id, s.row.subcategory_id),
      to: path(s.category_id, s.subcategory_id),
      category_id: s.category_id,
      subcategory_id: s.subcategory_id,
      confidence: s.confidence,
    }));
    return { ok: true, rows: out, checkedIds: rows.map((r) => r.id), remaining };
  } catch (e) {
    return failOf(e);
  }
}

const applyCategoriesSchema = z.object({
  accepted: z.array(z.object({ id: uuid, category_id: uuid, subcategory_id: uuid.nullable() })).max(60),
  checkedIds: z.array(uuid).max(60),
});

export async function applyCategoriesAction(input: z.input<typeof applyCategoriesSchema>): Promise<{ ok: true; message: string } | Fail> {
  const v = applyCategoriesSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "Invalid selection." };
  const { supabase } = await requireUser();
  for (const a of v.data.accepted) {
    const { error } = await supabase.from("transactions").update({ category_id: a.category_id, subcategory_id: a.subcategory_id, category_checked: true }).eq("id", a.id);
    if (error) return { ok: false, error: error.message };
  }
  if (v.data.checkedIds.length) await supabase.from("transactions").update({ category_checked: true }).in("id", v.data.checkedIds);
  revalidatePath("/", "layout");
  const n = v.data.accepted.length;
  return { ok: true, message: n ? `Recategorised ${n} transaction${n === 1 ? "" : "s"}` : "Marked as checked" };
}

// ---------------------------------------------------------------------------
// Merchant clean-up
// ---------------------------------------------------------------------------
export type MerchantFixRow = MerchantGroup & { categoryLabel: string | null };

export async function suggestMerchantsAction(): Promise<{ ok: true; groups: MerchantFixRow[]; remaining: number | null } | Fail> {
  try {
    const { supabase, cats, subs } = await lookups();
    const merchants = (await supabase.from("merchants").select("id, name, default_category_id")).data ?? [];
    if (merchants.length < 2) return { ok: true, groups: [], remaining: null };
    const stats = new Map<string, { count: number; cats: Map<string, number> }>();
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from("transactions").select("merchant_id, category_id").not("merchant_id", "is", null).range(from, from + 999);
      for (const r of data ?? []) {
        const s = stats.get(r.merchant_id!) ?? { count: 0, cats: new Map() };
        s.count += 1;
        s.cats.set(r.category_id, (s.cats.get(r.category_id) ?? 0) + 1);
        stats.set(r.merchant_id!, s);
      }
      if (!data || data.length < 1000) break;
    }
    const input = merchants
      .map((m) => {
        const s = stats.get(m.id);
        const top = s ? [...s.cats.entries()].sort(([, a], [, b]) => b - a)[0]?.[0] : null;
        return { ...m, count: s?.count ?? 0, usualCategory: top ? (cats.find((c) => c.id === top)?.name ?? null) : null };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 300)
      .sort((a, b) => a.name.localeCompare(b.name)); // alphabetical so near-duplicates sit together
    const { data, remaining } = await generateJson({ feature: "merchants", system: merchantsSystem(), input: { text: merchantsPrompt(input, cats, subs) }, schema: merchantCleanupSchema });
    const groups = planMerchantFixes(data, merchants, cats, subs).map((g) => {
      const c = g.category_id ? cats.find((x) => x.id === g.category_id)?.name : null;
      const s = g.subcategory_id ? subs.find((x) => x.id === g.subcategory_id)?.name : null;
      return { ...g, categoryLabel: c ? (s ? `${c} › ${s}` : c) : null };
    });
    return { ok: true, groups, remaining };
  } catch (e) {
    return failOf(e);
  }
}

const applyMerchantsSchema = z.object({
  groups: z
    .array(
      z.object({
        canonical: z.string().trim().min(1).max(120),
        targetId: uuid.nullable(),
        memberIds: z.array(uuid).min(1).max(50),
        category_id: uuid.nullable(),
        subcategory_id: uuid.nullable(),
      }),
    )
    .max(150),
});

export async function applyMerchantsAction(input: z.input<typeof applyMerchantsSchema>): Promise<{ ok: true; message: string } | Fail> {
  const v = applyMerchantsSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "Invalid selection." };
  const { supabase } = await requireUser();
  let merged = 0;
  let renamed = 0;
  for (const g of v.data.groups) {
    let target = g.targetId ?? g.memberIds[0];
    if (!g.targetId) {
      const up = await supabase.from("merchants").update({ name: g.canonical }).eq("id", target);
      if (up.error) {
        // the clean name was taken since the suggestion: merge into that merchant instead
        const existing = await supabase.from("merchants").select("id").eq("name_key", g.canonical.toLowerCase()).maybeSingle();
        if (!existing.data) return { ok: false, error: up.error.message };
        target = existing.data.id;
      } else renamed += 1;
    }
    for (const id of g.memberIds) {
      if (id === target) continue;
      const { error } = await supabase.rpc("merge_merchant", { p_from: id, p_to: target });
      if (error) return { ok: false, error: error.message };
      merged += 1;
    }
    if (g.category_id)
      await supabase.from("merchants").update({ default_category_id: g.category_id, default_subcategory_id: g.subcategory_id }).eq("id", target).is("default_category_id", null);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `Updated ${v.data.groups.length} merchant${v.data.groups.length === 1 ? "" : "s"} (${renamed} renamed, ${merged} merged)` };
}

// ---------------------------------------------------------------------------
// Receipt item names
// ---------------------------------------------------------------------------
async function itemCandidates() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("receipt_items").select("id, raw_name, normalized_name, item_category").eq("name_checked", false).limit(3000);
  if (error) throw new Error(error.message);
  return { supabase, rows: data ?? [] };
}

export async function countItemCandidates(): Promise<number> {
  return groupItems((await itemCandidates()).rows, Number.MAX_SAFE_INTEGER).length;
}

export async function suggestItemNamesAction(): Promise<{ ok: true; items: ItemSuggestion[]; checkedIds: string[]; remaining: number | null } | Fail> {
  try {
    const { supabase, rows } = await itemCandidates();
    const groups = groupItems(rows, 150);
    if (!groups.length) return { ok: true, items: [], checkedIds: [], remaining: null };
    const known = (await supabase.from("receipt_items").select("normalized_name").eq("name_checked", true).not("normalized_name", "is", null).limit(3000)).data ?? [];
    const existing = [...new Set(known.map((k) => k.normalized_name!))].slice(0, 300);
    const { data, remaining } = await generateJson({ feature: "items", system: itemNamesSystem(), input: { text: itemsPrompt(groups, existing) }, schema: itemNamesSchema });
    return { ok: true, items: mapItemNames(data, groups).filter((i) => i.changed), checkedIds: groups.flatMap((g) => g.ids), remaining };
  } catch (e) {
    return failOf(e);
  }
}

const applyItemsSchema = z.object({
  accepted: z.array(z.object({ ids: z.array(uuid).min(1).max(3000), normalized_name: z.string().trim().min(1).max(120), item_category: z.string().trim().max(60) })).max(150),
  checkedIds: z.array(uuid).max(3000),
});

export async function applyItemNamesAction(input: z.input<typeof applyItemsSchema>): Promise<{ ok: true; message: string } | Fail> {
  const v = applyItemsSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "Invalid selection." };
  const { supabase } = await requireUser();
  for (const a of v.data.accepted)
    for (const ids of chunks(a.ids)) {
      const { error } = await supabase.from("receipt_items").update({ normalized_name: a.normalized_name, item_category: a.item_category || null, name_checked: true }).in("id", ids);
      if (error) return { ok: false, error: error.message };
    }
  for (const ids of chunks(v.data.checkedIds)) await supabase.from("receipt_items").update({ name_checked: true }).in("id", ids);
  revalidatePath("/items");
  const n = v.data.accepted.length;
  return { ok: true, message: n ? `Renamed ${n} item${n === 1 ? "" : "s"}` : "Marked as checked" };
}
