"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { matchDuplicates, type ExistingRow } from "@/lib/import/dedupe";
import type { ImportBundle } from "@/lib/import/workbook";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "a date in the file isn't a real calendar date");

const name = (max: number) => z.string().min(1).max(max);
const optText = (max: number) => z.string().max(max).nullish();

const bundleSchema = z.object({
  replace_defaults: z.boolean(),
  budget_month: z.string().regex(/^\d{4}-\d{2}-01$/),
  categories: z.array(z.object({ name: name(60), subcategories: z.array(name(60)).optional(), description: optText(500) }).passthrough()).max(200),
  payment_methods: z.array(name(60)).max(200),
  people: z.array(name(60)).max(500),
  trips: z
    .array(
      z
        .object({ name: name(80), start_date: isoDate.nullish(), end_date: isoDate.nullish() })
        .passthrough()
        .refine((t) => !t.start_date || !t.end_date || t.end_date >= t.start_date, "a trip ends before it starts"),
    )
    .max(500),
  transactions: z
    .array(
      z
        .object({
          ref: z.string().max(40),
          date: isoDate,
          amount: z.number().positive(),
          category: name(60),
          subcategory: optText(60),
          merchant: optText(120),
          description: optText(500),
          notes: optText(2000),
          payment: optText(60),
          paid_by: optText(60),
          trip: optText(80),
          currency: z.string().regex(/^[A-Z]{3}$/).optional(),
        })
        .passthrough(),
    )
    .max(20000),
  plans: z
    .array(
      z
        .object({
          ref: z.string(),
          months: z.number().int().min(1).max(360),
          start_month: isoDate,
          installments: z.array(z.object({ due_date: isoDate, amount: z.number().positive() }).passthrough()).max(360),
        })
        .passthrough(),
    )
    .max(5000),
});

/** Plain-language text for a database rejection. Never shows raw SQL text. */
function friendlyDbError(e: { message?: string; code?: string }): string {
  const m = e.message ?? "";
  if (/description/.test(m) && /check/.test(m)) return "A description is longer than 500 characters";
  if (/notes/.test(m) && /check/.test(m)) return "A note is longer than 2000 characters";
  if (/amount/.test(m) && /check/.test(m)) return "A row has an amount that isn't above zero";
  if (/date|time zone|out of range/i.test(m) && /invalid|out of range/i.test(m)) return "A row has a date that isn't a real calendar date";
  if (/char_length|check constraint|violates/.test(m)) return "A name in the file is too long or empty";
  if (e.code === "42501" || /not authenticated/.test(m)) return "You're signed out. Sign in again and retry";
  return "The database rejected this file, so nothing was saved";
}

export async function importBundle(bundle: ImportBundle): Promise<{ ok: true; transactions: number; plans: number } | { ok: false; error: string }> {
  const parsed = bundleSchema.safeParse(bundle);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    const where = i?.path.length ? ` (${i.path.slice(0, 2).join(" ")})` : "";
    return { ok: false, error: `Invalid file contents: ${i?.message ?? "unknown problem"}${where}` };
  }
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("import_bundle", { p: bundle as never });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/", "layout");
  const res = data as { transactions: number; plans: number };
  return { ok: true, ...res };
}

const dupSchema = z
  .array(
    z.object({
      ref: z.string().max(40),
      date: isoDate,
      amount: z.number().positive(),
      merchant: z.string().max(120).nullable(),
      description: z.string().max(500).nullable(),
    }),
  )
  .max(20000);

/** Which file rows already exist in the account (same date and amount, shared merchant or description). */
export async function checkDuplicates(rows: unknown): Promise<{ ok: true; refs: string[] } | { ok: false; error: string }> {
  const parsed = dupSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, error: "Couldn't check for duplicates" };
  if (!parsed.data.length) return { ok: true, refs: [] };
  const { supabase } = await requireUser();
  const dates = parsed.data.map((r) => r.date).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];

  const existing: ExistingRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("date, amount, description, merchants(name)")
      .gte("date", from)
      .lte("date", to)
      .order("date")
      .order("id")
      .range(offset, offset + PAGE - 1);
    if (error) return { ok: false, error: "Couldn't check for duplicates" };
    for (const t of data ?? []) {
      const m = t.merchants as { name: string } | { name: string }[] | null;
      existing.push({ date: t.date, amount: Number(t.amount), description: t.description, merchant: (Array.isArray(m) ? m[0]?.name : m?.name) ?? null });
    }
    if ((data?.length ?? 0) < PAGE) break;
  }
  return { ok: true, refs: matchDuplicates(parsed.data, existing) };
}
