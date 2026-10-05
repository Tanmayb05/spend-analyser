"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";

type Result = { ok: true; message?: string; id?: string } | { ok: false; error: string };

const tripSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, "Name the trip").max(80),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    budget: z.number().min(0).nullable(),
    include_mode: z.enum(["excluded", "lump_sum", "itemized"]),
    lump_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    lump_category_id: z.string().uuid().nullable(),
    lump_spread_months: z.number().int().min(1).max(120).nullable(),
    notes: z.string().max(1000).nullable(),
  })
  .refine((t) => !t.start_date || !t.end_date || t.end_date >= t.start_date, { message: "End date is before start date" })
  .refine((t) => t.include_mode !== "lump_sum" || t.lump_category_id, { message: "Pick a category for the lump sum" });

export type TripInput = z.input<typeof tripSchema>;

export async function saveTrip(input: TripInput): Promise<Result> {
  const v = tripSchema.safeParse(input);
  if (!v.success) return { ok: false, error: v.error.issues[0].message };
  const { supabase } = await requireUser();
  const { id, ...data } = v.data;
  const res = id ? await supabase.from("trips").update(data).eq("id", id).select("id").single() : await supabase.from("trips").insert(data).select("id").single();
  if (res.error) return { ok: false, error: res.error.message.includes("duplicate") ? "A trip with that name exists." : res.error.message };
  revalidatePath("/", "layout");
  return { ok: true, message: "Trip saved", id: res.data.id };
}

export async function deleteTrip(id: string, deleteExpenses: boolean): Promise<Result> {
  const { supabase } = await requireUser();
  if (deleteExpenses) {
    const { error } = await supabase.from("transactions").delete().eq("trip_id", id);
    if (error) return { ok: false, error: error.message };
  }
  const { error } = await supabase.from("trips").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, message: "Trip deleted" };
}
