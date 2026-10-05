"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { getRate } from "@/lib/fx";
import { transactionSchema, type TransactionInput } from "@/lib/validation/transaction";
import type { Installment, SpreadPlan, Transaction } from "@/lib/data/types";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string; fields?: Record<string, string> };

function friendly(message: string): string {
  if (message.includes("already covers the total")) return "Per-month amount is too high for that many months.";
  if (message.includes("foreign key")) return "One of the selected options no longer exists. Refresh and try again.";
  return message;
}

export async function saveTransaction(input: TransactionInput): Promise<ActionResult<{ id: string }>> {
  const parsed = transactionSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0])] ??= i.message;
    return { ok: false, error: "Check the highlighted fields.", fields };
  }
  const p = parsed.data;
  const { supabase, userId } = await requireUser();

  const { data: profile } = await supabase.from("profiles").select("base_currency").eq("id", userId).single();
  const base = profile?.base_currency ?? "USD";

  let fx = 1;
  if (p.currency !== base) {
    try {
      fx = p.fx_rate ?? (await getRate(p.date, p.currency, base));
    } catch {
      return { ok: false, error: `Couldn't fetch the ${p.currency}→${base} rate. Enter it manually.`, fields: { fx_rate: "Enter a rate" } };
    }
  }

  const { data, error } = await supabase.rpc("save_transaction", { p: { ...p, fx_rate: fx } });
  if (error) return { ok: false, error: friendly(error.message) };

  revalidatePath("/", "layout");
  return { ok: true, data: { id: data } };
}

export type DeletedSnapshot = { transactions: Transaction[]; plans: SpreadPlan[]; installments: Installment[] };

export async function deleteTransactions(ids: string[]): Promise<ActionResult<DeletedSnapshot>> {
  if (!ids.length) return { ok: true, data: { transactions: [], plans: [], installments: [] } };
  const { supabase } = await requireUser();

  const [txns, plans] = await Promise.all([
    supabase.from("transactions").select("*").in("id", ids),
    supabase.from("spread_plans").select("*").in("transaction_id", ids),
  ]);
  const planIds = (plans.data ?? []).map((p) => p.id);
  const inst = planIds.length ? await supabase.from("installments").select("*").in("plan_id", planIds) : { data: [] };

  const { error } = await supabase.from("transactions").delete().in("id", ids);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, data: { transactions: txns.data ?? [], plans: plans.data ?? [], installments: inst.data ?? [] } };
}

/** Undo for deleteTransactions: re-inserts the exact rows (same ids, plans and schedules). */
export async function restoreTransactions(snap: DeletedSnapshot): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  const owned = <T extends { user_id: string }>(rows: T[]) => rows.filter((r) => r.user_id === userId);

  const txns = owned(snap.transactions).map(({ base_amount: _generated, ...t }) => t);
  if (txns.length) {
    const { error } = await supabase.from("transactions").insert(txns);
    if (error) return { ok: false, error: error.message };
  }
  const plans = owned(snap.plans);
  if (plans.length) {
    // insert as custom first so the trigger doesn't regenerate, then restore the saved schedule
    const { error } = await supabase.from("spread_plans").insert(plans.map((p) => ({ ...p, custom_schedule: true })));
    if (error) return { ok: false, error: error.message };
    const inst = owned(snap.installments);
    if (inst.length) await supabase.from("installments").delete().in("plan_id", plans.map((p) => p.id));
    if (inst.length) await supabase.from("installments").insert(inst);
    for (const p of plans.filter((x) => !x.custom_schedule)) {
      await supabase.from("spread_plans").update({ custom_schedule: false }).eq("id", p.id);
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
