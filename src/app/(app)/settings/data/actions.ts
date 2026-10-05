"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import type { ImportBundle } from "@/lib/import/workbook";

const bundleSchema = z.object({
  replace_defaults: z.boolean(),
  budget_month: z.string().regex(/^\d{4}-\d{2}-01$/),
  categories: z.array(z.object({ name: z.string().min(1).max(60) }).passthrough()).max(200),
  payment_methods: z.array(z.string().max(60)).max(200),
  people: z.array(z.string().max(60)).max(500),
  trips: z.array(z.object({ name: z.string().min(1).max(80) }).passthrough()).max(500),
  transactions: z.array(z.object({ date: z.string(), amount: z.number().positive(), category: z.string().min(1).max(60) }).passthrough()).max(20000),
  plans: z.array(z.object({ ref: z.string(), months: z.number().int().min(1).max(360) }).passthrough()).max(5000),
});

export async function importBundle(bundle: ImportBundle): Promise<{ ok: true; transactions: number; plans: number } | { ok: false; error: string }> {
  const parsed = bundleSchema.safeParse(bundle);
  if (!parsed.success) return { ok: false, error: `Invalid file contents: ${parsed.error.issues[0]?.message}` };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("import_bundle", { p: bundle as never });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  const res = data as { transactions: number; plans: number };
  return { ok: true, ...res };
}

export async function deleteAllTransactions(confirm: string): Promise<{ ok: boolean; error?: string }> {
  if (confirm !== "DELETE") return { ok: false, error: 'Type DELETE to confirm.' };
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("transactions").delete().eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  await supabase.from("receipts").delete().eq("user_id", userId).is("storage_path", null);
  revalidatePath("/", "layout");
  return { ok: true };
}
