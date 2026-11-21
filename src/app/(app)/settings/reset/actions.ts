"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPassword } from "@/lib/supabase/reauth";
import { removeUserReceipts } from "@/lib/receipt-storage";

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
