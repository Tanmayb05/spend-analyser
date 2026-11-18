"use server";

import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { getReferenceData } from "@/lib/data/reference";
import { parseISO, toISO } from "@/lib/dates";

type Result = { ok: true } | { ok: false; error: string };

const ids = z.array(z.string().min(1).max(200)).min(1).max(200);

// No revalidatePath: the panel updates optimistically, and the saved state applies on the next load.
async function upsert(rows: { notice_id: string; read_at?: string | null; dismissed_at?: string | null; snoozed_until?: string | null }[]): Promise<Result> {
  const { supabase, userId } = await requireUser();
  const now = new Date().toISOString();
  const { error } = await supabase.from("notification_state").upsert(
    rows.map((r) => ({ ...r, user_id: userId, updated_at: now })),
    { onConflict: "user_id,notice_id" },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function markNoticesRead(input: string[]): Promise<Result> {
  const v = ids.safeParse(input);
  if (!v.success) return { ok: false, error: "Invalid notifications" };
  const now = new Date().toISOString();
  return upsert(v.data.map((notice_id) => ({ notice_id, read_at: now })));
}

export async function dismissNotice(id: string): Promise<Result> {
  if (!ids.safeParse([id]).success) return { ok: false, error: "Invalid notification" };
  return upsert([{ notice_id: id, dismissed_at: new Date().toISOString() }]);
}

/** Hide until `days` from today; it comes back unread. */
export async function snoozeNotice(id: string, days: number): Promise<Result> {
  if (!ids.safeParse([id]).success || !z.number().int().min(1).max(90).safeParse(days).success) return { ok: false, error: "Invalid snooze" };
  const { today } = await getReferenceData();
  const until = parseISO(today);
  until.setDate(until.getDate() + days);
  return upsert([{ notice_id: id, snoozed_until: toISO(until), read_at: null, dismissed_at: null }]);
}

/** Undo a dismiss or snooze. */
export async function restoreNotice(id: string): Promise<Result> {
  if (!ids.safeParse([id]).success) return { ok: false, error: "Invalid notification" };
  return upsert([{ notice_id: id, dismissed_at: null, snoozed_until: null }]);
}
