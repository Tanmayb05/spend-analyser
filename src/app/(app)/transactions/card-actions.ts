"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";

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

const newCardSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(60),
  credit_limit: z.number().positive("Enter the credit limit").max(1e12),
  statement_day: day,
  due_day: day,
  tracking_from: isoDate,
});

/** Add a new payment method that is a credit card. A new card starts tracking today with nothing owed. */
export async function addCreditCard(input: z.infer<typeof newCardSchema>): Promise<Result> {
  const v = newCardSchema.safeParse(input);
  if (!v.success) return fail(v.error.issues[0].message);
  const { supabase } = await requireUser();
  const { error } = await supabase.from("payment_methods").insert({ ...v.data, is_credit_card: true, opening_balance: 0 });
  return error ? fail(error.message.includes("duplicate key") ? "That name is already used." : error.message) : done("Card added");
}

const detailsSchema = z.object({
  id: z.string().uuid(),
  nickname: z.string().trim().max(60).nullable(),
  issuer: z.string().trim().max(60).nullable(),
  network: z.enum(["visa", "mastercard", "amex", "discover", "other"]).nullable(),
  color: z.string().regex(/^c[1-8]$/).nullable(),
  last4s: z.array(z.string().regex(/^\d{4}$/, "Last 4 digits must be four numbers")).max(6),
});
export type CardDetailsInput = z.infer<typeof detailsSchema>;

/** Nickname, issuer, network, colour and the last 4 digits that identify this card on receipts. */
export async function saveCardDetails(input: CardDetailsInput): Promise<Result> {
  const v = detailsSchema.safeParse(input);
  if (!v.success) return fail(v.error.issues[0].message);
  const { id, last4s, ...fields } = v.data;
  const unique = [...new Set(last4s)];
  const { supabase, userId } = await requireUser();
  const up = await supabase
    .from("payment_methods")
    .update({ nickname: fields.nickname || null, issuer: fields.issuer || null, network: fields.network, color: fields.color })
    .eq("id", id);
  if (up.error) return fail(up.error.message);

  const current = await supabase.from("payment_method_cards").select("last4").eq("payment_method_id", id);
  if (current.error) return fail(current.error.message);
  const have = new Set((current.data ?? []).map((r) => r.last4));
  const drop = [...have].filter((x) => !unique.includes(x));
  const add = unique.filter((x) => !have.has(x));
  if (drop.length) {
    const del = await supabase.from("payment_method_cards").delete().eq("payment_method_id", id).in("last4", drop);
    if (del.error) return fail(del.error.message);
  }
  if (add.length) {
    const ins = await supabase.from("payment_method_cards").insert(add.map((last4) => ({ user_id: userId, payment_method_id: id, last4 })));
    if (ins.error) return fail(ins.error.code === "23505" ? "One of those numbers already belongs to another card." : ins.error.message);
  }
  return done("Card details saved");
}
