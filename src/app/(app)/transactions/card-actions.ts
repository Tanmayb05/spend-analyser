"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { KIND_META, KINDS, type PaymentKind } from "@/lib/payment-kinds";

type Result = { ok: true; message?: string } | { ok: false; error: string };

const done = (message?: string): Result => {
  revalidatePath("/", "layout");
  return { ok: true, message };
};
const fail = (error: string): Result => ({ ok: false, error });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const day = z.number().int().min(1).max(31).nullable();

const cardSchema = z.object({
  id: z.string().uuid(),
  is_credit_card: z.boolean(),
  credit_limit: z.number().positive("Credit limit must be above 0").max(1e12).nullable(),
  statement_day: day,
  due_day: day,
  opening_balance: z.number().min(0).max(1e12),
  tracking_from: isoDate.nullable(),
  min_due_pct: z.number().positive("Minimum % must be above 0").max(100, "Minimum % can't exceed 100").nullable().optional(),
  min_due_floor: z.number().min(0).max(1e12).nullable().optional(),
});
export type CardSettingsInput = z.infer<typeof cardSchema>;

/** Mark a payment method as a credit card (or not) and set its limit and billing cycle. */
export async function saveCardSettings(input: CardSettingsInput): Promise<Result> {
  const v = cardSchema.safeParse(input);
  if (!v.success) return fail(v.error.issues[0].message);
  const { id, ...p } = v.data;
  if (p.is_credit_card && !p.credit_limit) return fail("Enter the credit limit");
  const { supabase } = await requireUser();
  // a trigger keeps the type in step with the flag: turning tracking off moves a credit card to Other
  const { error } = await supabase.from("payment_methods").update(p).eq("id", id);
  return error ? fail(error.message) : done(p.is_credit_card ? "Card saved" : "Saved");
}

const paymentSchema = z.object({
  card: z.string().uuid(),
  date: isoDate,
  amount: z.number().positive("Enter an amount above 0").max(1e12),
  note: z.string().trim().max(200).nullable(),
});

/** Record a bill payment (setoff) against a card. Not an expense: it only lowers what's owed. */
export async function addCardPayment(input: z.infer<typeof paymentSchema>): Promise<Result> {
  const v = paymentSchema.safeParse(input);
  if (!v.success) return fail(v.error.issues[0].message);
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("card_payments")
    .insert({ payment_method_id: v.data.card, date: v.data.date, amount: v.data.amount, note: v.data.note || null });
  return error ? fail(error.message.includes("foreign key") ? "That card no longer exists." : error.message) : done("Payment recorded");
}

export async function deleteCardPayment(id: string): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid payment");
  const { supabase } = await requireUser();
  const { error } = await supabase.from("card_payments").delete().eq("id", id);
  return error ? fail(error.message) : done("Payment removed");
}

// ---------------------------------------------------------------------------
// Payment methods by type: one call to add, one to edit.
// ---------------------------------------------------------------------------

const kindEnum = z.enum(KINDS);
const methodSchema = z
  .object({
    kind: kindEnum,
    name: z.string().trim().min(1, "Enter a name").max(60),
    nickname: z.string().trim().max(60).nullable().optional(),
    issuer: z.string().trim().max(60).nullable().optional(),
    network: z.enum(["visa", "mastercard", "amex", "discover", "other"]).nullable().optional(),
    color: z.string().regex(/^c[1-8]$/).nullable().optional(),
    last4s: z.array(z.string().regex(/^\d{4}$/, "Last 4 digits must be four numbers")).max(6).optional(),
    credit_limit: z.number().positive("Enter the credit limit").max(1e12).nullable().optional(),
    statement_day: day.optional(),
    due_day: day.optional(),
    opening_balance: z.number().min(0).max(1e12).optional(),
    tracking_from: isoDate.nullable().optional(),
    min_due_pct: z.number().positive("Minimum % must be above 0").max(100, "Minimum % can't exceed 100").nullable().optional(),
    min_due_floor: z.number().min(0).max(1e12).nullable().optional(),
  })
  .refine((m) => m.kind !== "credit_card" || (m.credit_limit ?? 0) > 0, { message: "Enter the credit limit", path: ["credit_limit"] });

const createSchema = methodSchema;
const editSchema = methodSchema.and(z.object({ id: z.string().uuid() }));
export type PaymentMethodInput = z.input<typeof createSchema>;
export type PaymentMethodEditInput = z.input<typeof editSchema>;

/** The columns a method of this type keeps. Anything the type does not use is cleared, so a stale number never matches a receipt. */
function rowFor(m: z.infer<typeof methodSchema>) {
  const f = KIND_META[m.kind as PaymentKind].fields;
  const credit = f.creditTerms;
  return {
    name: m.name,
    kind: m.kind,
    is_credit_card: m.kind === "credit_card",
    nickname: f.nickname ? m.nickname || null : null,
    issuer: f.issuer ? m.issuer || null : null,
    network: f.network ? (m.network ?? null) : null,
    color: m.color ?? null,
    credit_limit: credit ? (m.credit_limit ?? null) : null,
    statement_day: credit ? (m.statement_day ?? null) : null,
    due_day: credit ? (m.due_day ?? null) : null,
    opening_balance: credit ? (m.opening_balance ?? 0) : 0,
    tracking_from: credit ? (m.tracking_from ?? null) : null,
    min_due_pct: credit ? (m.min_due_pct ?? null) : null,
    min_due_floor: credit ? (m.min_due_floor ?? null) : null,
  };
}

/** Sets the saved last 4 digits for a method to exactly `want` (empty for types that do not use them). */
async function syncLast4s(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], userId: string, id: string, want: string[]): Promise<Result | null> {
  const current = await supabase.from("payment_method_cards").select("last4").eq("payment_method_id", id);
  if (current.error) return fail(current.error.message);
  const have = new Set((current.data ?? []).map((r) => r.last4));
  const drop = [...have].filter((x) => !want.includes(x));
  const add = want.filter((x) => !have.has(x));
  if (drop.length) {
    const del = await supabase.from("payment_method_cards").delete().eq("payment_method_id", id).in("last4", drop);
    if (del.error) return fail(del.error.message);
  }
  if (add.length) {
    const ins = await supabase.from("payment_method_cards").insert(add.map((last4) => ({ user_id: userId, payment_method_id: id, last4 })));
    if (ins.error) return fail(ins.error.code === "23505" ? "One of those numbers already belongs to another card." : ins.error.message);
  }
  return null;
}

/** Add a payment method of any type with the details that type uses. */
export async function createPaymentMethod(input: PaymentMethodInput): Promise<Result & { id?: string }> {
  const v = createSchema.safeParse(input);
  if (!v.success) return fail(v.error.issues[0].message);
  const { supabase, userId } = await requireUser();
  const ins = await supabase.from("payment_methods").insert(rowFor(v.data)).select("id").single();
  if (ins.error) return fail(ins.error.code === "23505" ? "That name is already used." : ins.error.message);
  const last4s = KIND_META[v.data.kind as PaymentKind].fields.last4s ? [...new Set(v.data.last4s ?? [])] : [];
  if (last4s.length) {
    const r = await syncLast4s(supabase, userId, ins.data.id, last4s);
    if (r) {
      // keep nothing half-made: drop the new row so the user can fix the number and retry
      await supabase.from("payment_methods").delete().eq("id", ins.data.id);
      return r;
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Payment method added", id: ins.data.id };
}

/** Save every field of a payment method in one call, including a change of type. */
export async function savePaymentMethod(input: PaymentMethodEditInput): Promise<Result> {
  const v = editSchema.safeParse(input);
  if (!v.success) return fail(v.error.issues[0].message);
  const { id, ...m } = v.data;
  const { supabase, userId } = await requireUser();
  const up = await supabase.from("payment_methods").update(rowFor(m)).eq("id", id);
  if (up.error) return fail(up.error.code === "23505" ? "That name is already used." : up.error.message);
  const last4s = KIND_META[m.kind as PaymentKind].fields.last4s ? [...new Set(m.last4s ?? [])] : [];
  const r = await syncLast4s(supabase, userId, id, last4s);
  if (r) return r;
  return done("Saved");
}
