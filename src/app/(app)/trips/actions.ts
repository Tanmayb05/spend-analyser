"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { findStockCover } from "@/lib/trip-cover";

const COVER_BUCKET = "trip-covers";

type Result = { ok: true; message?: string; id?: string } | { ok: false; error: string };

const tripSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, "Name the trip").max(80),
    destination: z.string().trim().max(120).nullable().optional(),
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
  const { id, ...rest } = v.data;
  const data = { ...rest, destination: rest.destination || null };
  const before = id ? (await supabase.from("trips").select("name, destination, cover_path").eq("id", id).single()).data : null;
  const res = id ? await supabase.from("trips").update(data).eq("id", id).select("id").single() : await supabase.from("trips").insert(data).select("id").single();
  if (res.error) return { ok: false, error: res.error.message.includes("duplicate") ? "A trip with that name exists." : res.error.message };
  // stock photo for new trips or when the search text changed; an uploaded photo is never replaced here
  const query = data.destination ?? data.name;
  const changed = !before || (before.destination ?? before.name) !== query;
  if (changed && !before?.cover_path) {
    const cover = await findStockCover(query);
    if (cover) {
      await supabase
        .from("trips")
        .update({ cover_url: cover.url, cover_credit_name: cover.creditName, cover_credit_url: cover.creditUrl })
        .eq("id", res.data.id);
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Trip saved", id: res.data.id };
}

export async function deleteTrip(id: string, deleteExpenses: boolean): Promise<Result> {
  const { supabase } = await requireUser();
  if (deleteExpenses) {
    const { error } = await supabase.from("transactions").delete().eq("trip_id", id);
    if (error) return { ok: false, error: error.message };
  }
  const { data: trip } = await supabase.from("trips").select("cover_path").eq("id", id).single();
  const { error } = await supabase.from("trips").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (trip?.cover_path) await supabase.storage.from(COVER_BUCKET).remove([trip.cover_path]);
  revalidatePath("/", "layout");
  return { ok: true, message: "Trip deleted" };
}

const NO_COVER = { cover_url: null, cover_path: null, cover_credit_name: null, cover_credit_url: null };

/** Another stock photo for the same place (random among the top results). */
export async function refreshTripCover(id: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { data: trip } = await supabase.from("trips").select("name, destination, cover_path").eq("id", id).single();
  if (!trip) return { ok: false, error: "Trip not found" };
  const cover = await findStockCover(trip.destination ?? trip.name, { pick: "random" });
  if (!cover) return { ok: false, error: process.env.UNSPLASH_ACCESS_KEY ? "No photo found for that place" : "Photo search isn't set up (no UNSPLASH_ACCESS_KEY)" };
  if (trip.cover_path) await supabase.storage.from(COVER_BUCKET).remove([trip.cover_path]);
  const { error } = await supabase
    .from("trips")
    .update({ cover_url: cover.url, cover_path: null, cover_credit_name: cover.creditName, cover_credit_url: cover.creditUrl })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, message: "Photo changed" };
}

/** Points a trip at a file the browser already uploaded to `trip-covers/<uid>/...`. */
export async function setTripCoverUpload(id: string, path: string): Promise<Result> {
  const { supabase, userId } = await requireUser();
  if (!path.startsWith(`${userId}/`) || path.includes("..")) return { ok: false, error: "Invalid file" };
  const { data: trip } = await supabase.from("trips").select("cover_path").eq("id", id).single();
  if (!trip) return { ok: false, error: "Trip not found" };
  const { error } = await supabase.from("trips").update({ ...NO_COVER, cover_path: path }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (trip.cover_path && trip.cover_path !== path) await supabase.storage.from(COVER_BUCKET).remove([trip.cover_path]);
  revalidatePath("/", "layout");
  return { ok: true, message: "Photo saved" };
}

export async function removeTripCover(id: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { data: trip } = await supabase.from("trips").select("cover_path").eq("id", id).single();
  if (!trip) return { ok: false, error: "Trip not found" };
  const { error } = await supabase.from("trips").update(NO_COVER).eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (trip.cover_path) await supabase.storage.from(COVER_BUCKET).remove([trip.cover_path]);
  revalidatePath("/", "layout");
  return { ok: true, message: "Photo removed" };
}
