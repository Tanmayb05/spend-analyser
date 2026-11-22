import "server-only";
import { cache } from "react";
import { requireUser } from "@/lib/supabase/server";
import { todayIn } from "@/lib/dates";
import type { ReferenceData } from "./types";
import { aiConfigured, supportsTranscription } from "@/lib/ai/config";
import { buildEntryHints, type HintRow } from "@/lib/entry-hints";

/** How much recent history shapes the add form's suggestions. */
const HINT_ROWS = 300;

/** Everything the UI needs for pickers and lookups. One round trip per request (React cache). */
export const getReferenceData = cache(async (): Promise<ReferenceData> => {
  const { supabase, userId, email } = await requireUser();

  const [profile, categories, subcategories, paymentMethods, people, trips, merchants, budgets, recent] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase.from("categories").select("*").order("sort_order").order("name"),
    supabase.from("subcategories").select("*").order("sort_order").order("name"),
    supabase.from("payment_methods").select("*").order("sort_order").order("name"),
    supabase.from("people").select("*").order("is_self", { ascending: false }).order("name"),
    supabase.from("trips").select("*").order("start_date", { ascending: false, nullsFirst: true }),
    supabase.from("merchants").select("*").order("name"),
    supabase.from("budgets").select("*").order("effective_month"),
    supabase
      .from("transactions")
      .select("type, category_id, subcategory_id, merchant_id, payment_method_id, paid_by_id")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(HINT_ROWS),
  ]);

  if (profile.error || !profile.data) throw new Error(`Profile missing: ${profile.error?.message}`);

  return {
    userId,
    email,
    profile: profile.data,
    categories: categories.data ?? [],
    subcategories: subcategories.data ?? [],
    paymentMethods: paymentMethods.data ?? [],
    people: people.data ?? [],
    trips: trips.data ?? [],
    merchants: merchants.data ?? [],
    budgets: budgets.data ?? [],
    entryHints: buildEntryHints((recent.data ?? []) as HintRow[]),
    today: todayIn(profile.data.timezone),
    aiReady: aiConfigured() && profile.data.ai_enabled,
    voiceReady: aiConfigured() && profile.data.ai_enabled && supportsTranscription(),
  };
});
