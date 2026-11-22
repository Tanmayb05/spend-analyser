import "server-only";
import { requireUser } from "@/lib/supabase/server";
import { todayIn } from "@/lib/dates";
import type { Category, Subcategory } from "@/lib/data/types";

export async function context() {
  const { supabase, userId } = await requireUser();
  const [profile, categories, subcategories, merchants, trips, payments, people] = await Promise.all([
    supabase.from("profiles").select("base_currency, timezone").eq("id", userId).single(),
    supabase.from("categories").select("*").eq("archived", false).order("sort_order"),
    supabase.from("subcategories").select("*").eq("archived", false),
    supabase.from("merchants").select("id, name").order("created_at", { ascending: false }).limit(300),
    supabase.from("trips").select("id, name, start_date, end_date").order("start_date", { ascending: false, nullsFirst: true }).limit(20),
    supabase.from("payment_methods").select("id, name, nickname, issuer, network, archived").eq("archived", false).order("sort_order"),
    supabase.from("people").select("id, name, is_self").eq("archived", false).order("is_self", { ascending: false }).order("name"),
  ]);
  const cats = categories.data ?? [];
  const subs = subcategories.data ?? [];
  return {
    supabase,
    userId,
    base: profile.data?.base_currency ?? "USD",
    today: todayIn(profile.data?.timezone ?? "UTC"),
    cats,
    subs,
    merchants: merchants.data ?? [],
    trips: trips.data ?? [],
    payments: payments.data ?? [],
    people: people.data ?? [],
  };
}

export function categoryList(cats: Category[], subs: Subcategory[], kind?: "expense" | "income") {
  return cats
    .filter((c) => !kind || c.kind === kind)
    .map((c) => `- ${c.name} (${c.kind})${subs.some((s) => s.category_id === c.id) ? `: ${subs.filter((s) => s.category_id === c.id).map((s) => s.name).join(", ")}` : ""}`)
    .join("\n");
}

export function matchCategory(cats: Category[], subs: Subcategory[], name: string | null, subName: string | null) {
  const c = cats.find((x) => x.name.toLowerCase() === (name ?? "").toLowerCase());
  const s = c ? subs.find((x) => x.category_id === c.id && x.name.toLowerCase() === (subName ?? "").toLowerCase()) : undefined;
  return { category_id: c?.id ?? "", subcategory_id: s?.id ?? "" };
}
