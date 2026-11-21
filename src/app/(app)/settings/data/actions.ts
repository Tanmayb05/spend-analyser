"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPassword } from "@/lib/supabase/reauth";
import { removeUserReceipts } from "@/lib/receipt-storage";
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

/**
 * Wipe the account's data (and optionally its setup) without deleting the account.
 * `scope`: "data" keeps categories, budgets, payment methods, people; "all" also resets those to
 * the signup defaults. Needs the typed word AND the current password.
 */
export async function resetAccount(confirm: string, password: string, scope: "data" | "all"): Promise<{ ok: boolean; error?: string }> {
  if (confirm !== "RESET") return { ok: false, error: "Type RESET to confirm." };
  if (scope !== "data" && scope !== "all") return { ok: false, error: "Choose what to reset." };
  const { supabase, userId, email } = await requireUser();
  if (!(await verifyPassword(email ?? "", password, userId))) return { ok: false, error: "Wrong password." };
  const { error } = await supabase.rpc("reset_account", { p_reset_setup: scope === "all" });
  if (error) return { ok: false, error: error.message };
  // files after rows: a failure here leaves orphan files, never rows pointing at missing files
  try {
    await removeUserReceipts(createAdminClient(), userId);
  } catch {
    revalidatePath("/", "layout");
    return { ok: false, error: "Your data was reset, but some receipt files couldn't be removed." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
