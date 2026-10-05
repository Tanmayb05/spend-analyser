"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRate } from "@/lib/fx";
import { todayIn } from "@/lib/dates";
import { emailSchema, passwordSchema } from "@/lib/validation/auth";

export type Result = { ok: true; message?: string } | { ok: false; error: string };

const done = (message?: string): Result => {
  revalidatePath("/", "layout");
  return { ok: true, message };
};
const fail = (e: { message: string } | string): Result => ({ ok: false, error: typeof e === "string" ? e : friendly(e.message) });

function friendly(m: string) {
  if (m.includes("duplicate key")) return "That name is already used.";
  if (m.includes("violates foreign key")) return "It's still in use. Move or merge its transactions first.";
  return m;
}

const name = z.string().trim().min(1, "Enter a name").max(60);
const uuid = z.string().uuid();

// ---------------------------------------------------------------------------
// Profile / account
// ---------------------------------------------------------------------------
export async function updateProfile(displayName: string): Promise<Result> {
  const v = z.string().trim().min(1).max(80).safeParse(displayName);
  if (!v.success) return fail("Enter your name");
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("profiles").update({ display_name: v.data }).eq("id", userId);
  return error ? fail(error) : done("Saved");
}

export async function updateEmail(email: string): Promise<Result> {
  const v = emailSchema.safeParse(email);
  if (!v.success) return fail("Enter a valid email");
  const { supabase } = await requireUser();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.updateUser({ email: v.data }, { emailRedirectTo: `${site}/auth/confirm?next=/settings/profile` });
  return error ? fail(error) : { ok: true, message: "Check both inboxes to confirm the change." };
}

export async function changePassword(password: string, confirm: string): Promise<Result> {
  const v = passwordSchema.safeParse(password);
  if (!v.success) return fail(v.error.issues[0].message);
  if (password !== confirm) return fail("Passwords don't match");
  const { supabase } = await requireUser();
  const { error } = await supabase.auth.updateUser({ password });
  return error ? fail(error.code === "same_password" ? "New password must differ from the old one." : error.message) : { ok: true, message: "Password updated" };
}

export async function signOutEverywhere() {
  const { supabase } = await requireUser();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login");
}

export async function deleteAccount(confirm: string): Promise<Result> {
  if (confirm !== "DELETE") return fail("Type DELETE to confirm.");
  const { supabase, userId } = await requireUser();
  const admin = createAdminClient();
  // receipts in storage first (database rows cascade with the user)
  const { data: files } = await admin.storage.from("receipts").list(userId, { limit: 1000 });
  if (files?.length) await admin.storage.from("receipts").remove(files.map((f) => `${userId}/${f.name}`));
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return fail(error);
  await supabase.auth.signOut();
  redirect("/signup");
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------
const prefsSchema = z.object({
  base_currency: z.string().regex(/^[A-Z]{3}$/),
  locale: z.string().min(2).max(20),
  timezone: z.string().min(1).max(64),
  week_start: z.coerce.number().int().min(0).max(1),
  theme: z.enum(["dark", "light", "system"]),
  dashboard_mode: z.enum(["normalized", "cash"]),
  default_spread_months: z.coerce.number().int().min(1).max(120),
  convert_budgets: z.boolean().optional(),
});

export async function updatePreferences(input: z.input<typeof prefsSchema>): Promise<Result> {
  const v = prefsSchema.safeParse(input);
  if (!v.success) return fail(v.error.issues[0].message);
  try {
    new Intl.DateTimeFormat("en", { timeZone: v.data.timezone });
  } catch {
    return fail("Unknown timezone");
  }
  const { supabase, userId } = await requireUser();
  const { data: current } = await supabase.from("profiles").select("base_currency").eq("id", userId).single();

  const { convert_budgets, base_currency, ...rest } = v.data;
  const { error } = await supabase.from("profiles").update(rest).eq("id", userId);
  if (error) return fail(error);

  (await cookies()).set("theme", v.data.theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });

  if (current && current.base_currency !== base_currency) {
    // gather every (currency, date) pair and look up its rate into the new base
    const pairs = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from("transactions").select("currency,date").neq("currency", base_currency).range(from, from + 999);
      for (const r of data ?? []) pairs.add(`${r.currency}|${r.date}`);
      if (!data || data.length < 1000) break;
    }
    const rates: Record<string, number> = {};
    try {
      await Promise.all(
        [...pairs].map(async (k) => {
          const [ccy, date] = k.split("|");
          rates[k] = await getRate(date, ccy, base_currency);
        }),
      );
    } catch (e) {
      return fail(`Couldn't fetch exchange rates: ${(e as Error).message}`);
    }
    const budgetRate = convert_budgets ? await getRate(todayIn("UTC"), current.base_currency, base_currency) : null;
    const { error: rbErr } = await supabase.rpc("rebase_currency", { p_new: base_currency, p_rates: rates, p_budget_rate: budgetRate ?? undefined });
    if (rbErr) return fail(rbErr);
    return done(`Switched to ${base_currency}; ${pairs.size ? "all amounts were converted at each day's rate" : "amounts updated"}.`);
  }
  return done("Saved");
}

// ---------------------------------------------------------------------------
// Categories & subcategories
// ---------------------------------------------------------------------------
const categorySchema = z.object({
  id: uuid.optional(),
  name,
  kind: z.enum(["expense", "income"]),
  is_core: z.boolean(),
  color: z.string().regex(/^c[1-8]$/).nullable(),
  description: z.string().max(200).nullable().optional(),
});

export async function saveCategory(input: z.input<typeof categorySchema>): Promise<Result> {
  const v = categorySchema.safeParse(input);
  if (!v.success) return fail(v.error.issues[0].message);
  const { supabase } = await requireUser();
  const { id, ...data } = v.data;
  if (id) {
    const { error } = await supabase.from("categories").update(data).eq("id", id);
    return error ? fail(error) : done("Saved");
  }
  const { data: max } = await supabase.from("categories").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("categories").insert({ ...data, sort_order: (max?.sort_order ?? 0) + 1 });
  return error ? fail(error) : done("Category added");
}

export async function setCategoryArchived(id: string, archived: boolean): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("categories").update({ archived }).eq("id", id);
  return error ? fail(error) : done(archived ? "Archived" : "Restored");
}

/** Delete a category; if it has transactions, they move to `mergeInto` first. */
export async function deleteCategory(id: string, mergeInto: string | null): Promise<Result> {
  const { supabase } = await requireUser();
  if (mergeInto) {
    const { error } = await supabase.rpc("merge_category", { p_from: id, p_to: mergeInto });
    return error ? fail(error) : done("Merged and deleted");
  }
  const { count } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("category_id", id);
  if (count) return fail(`${count} transactions use this category. Choose where to move them.`);
  const { error } = await supabase.from("categories").delete().eq("id", id);
  return error ? fail(error) : done("Deleted");
}

export async function reorderCategories(ids: string[]): Promise<Result> {
  const { supabase } = await requireUser();
  const results = await Promise.all(ids.map((id, i) => supabase.from("categories").update({ sort_order: i + 1 }).eq("id", id)));
  const err = results.find((r) => r.error)?.error;
  return err ? fail(err) : done();
}

export async function saveSubcategory(input: { id?: string; category_id: string; name: string }): Promise<Result> {
  const v = z.object({ id: uuid.optional(), category_id: uuid, name }).safeParse(input);
  if (!v.success) return fail(v.error.issues[0].message);
  const { supabase } = await requireUser();
  const { id, ...data } = v.data;
  const { error } = id ? await supabase.from("subcategories").update({ name: data.name }).eq("id", id) : await supabase.from("subcategories").insert(data);
  return error ? fail(error) : done();
}

export async function deleteSubcategory(id: string): Promise<Result> {
  const { supabase } = await requireUser();
  // transactions keep their category; subcategory is cleared by the FK (on delete set null)
  const { error } = await supabase.from("subcategories").delete().eq("id", id);
  return error ? fail(error) : done("Deleted");
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------
export async function setBudget(categoryId: string, month: string, amount: number, replaceFuture: boolean): Promise<Result> {
  const v = z.object({ c: uuid, m: z.string().regex(/^\d{4}-\d{2}-01$/), a: z.number().min(0).max(1e10) }).safeParse({ c: categoryId, m: month, a: amount });
  if (!v.success) return fail("Enter a valid amount");
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_budget", { p_category: categoryId, p_month: month, p_amount: amount, p_replace_future: replaceFuture });
  return error ? fail(error) : done("Budget saved");
}

// ---------------------------------------------------------------------------
// Payment methods & people (simple named lists)
// ---------------------------------------------------------------------------
type ListTable = "payment_methods" | "people";

export async function saveListItem(table: ListTable, input: { id?: string; name: string }): Promise<Result> {
  if (table !== "payment_methods" && table !== "people") return fail("Invalid list");
  const v = z.object({ id: uuid.optional(), name }).safeParse(input);
  if (!v.success) return fail(v.error.issues[0].message);
  const { supabase } = await requireUser();
  const { error } = v.data.id
    ? await supabase.from(table).update({ name: v.data.name }).eq("id", v.data.id)
    : await supabase.from(table).insert({ name: v.data.name });
  return error ? fail(error) : done();
}

export async function setListItemArchived(table: ListTable, id: string, archived: boolean): Promise<Result> {
  if (table !== "payment_methods" && table !== "people") return fail("Invalid list");
  const { supabase } = await requireUser();
  const { error } = await supabase.from(table).update({ archived }).eq("id", id);
  return error ? fail(error) : done(archived ? "Archived" : "Restored");
}

export async function deleteListItem(table: ListTable, id: string): Promise<Result> {
  if (table !== "payment_methods" && table !== "people") return fail("Invalid list");
  const { supabase } = await requireUser();
  if (table === "people") {
    const { data } = await supabase.from("people").select("is_self").eq("id", id).single();
    if (data?.is_self) return fail("You can't delete yourself. Rename it instead.");
  }
  // transactions keep their data; the reference is cleared (on delete set null)
  const { error } = await supabase.from(table).delete().eq("id", id);
  return error ? fail(error) : done("Deleted");
}

// ---------------------------------------------------------------------------
// Merchants
// ---------------------------------------------------------------------------
export async function saveMerchant(input: { id: string; name: string; default_category_id: string | null; default_subcategory_id: string | null }): Promise<Result> {
  const v = z
    .object({ id: uuid, name: z.string().trim().min(1).max(120), default_category_id: uuid.nullable(), default_subcategory_id: uuid.nullable() })
    .safeParse(input);
  if (!v.success) return fail(v.error.issues[0].message);
  const { supabase } = await requireUser();
  const { id, ...data } = v.data;
  const { error } = await supabase.from("merchants").update(data).eq("id", id);
  return error ? fail(error) : done("Saved");
}

export async function mergeMerchant(from: string, to: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("merge_merchant", { p_from: from, p_to: to });
  return error ? fail(error) : done("Merged");
}

export async function deleteMerchant(id: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("merchants").delete().eq("id", id);
  return error ? fail(error) : done("Deleted");
}
