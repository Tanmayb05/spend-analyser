import "server-only";
import { requireUser } from "@/lib/supabase/server";
import { round2 } from "@/lib/utils";

export type TripStat = { total: number; count: number; first: string | null; last: string | null; bySub: Record<string, number>; largest: number };

/** Raw spend per trip (expense − refund), regardless of whether the trip counts in monthly spending. */
export async function getTripStats(tripId?: string): Promise<Map<string, TripStat>> {
  const { supabase } = await requireUser();
  const out = new Map<string, TripStat>();
  for (let from = 0; ; from += 1000) {
    let q = supabase.from("transactions").select("trip_id,type,base_amount,date,subcategory_id,category_id").not("trip_id", "is", null);
    if (tripId) q = q.eq("trip_id", tripId);
    const { data } = await q.range(from, from + 999);
    for (const r of data ?? []) {
      const s = out.get(r.trip_id!) ?? { total: 0, count: 0, first: null, last: null, bySub: {}, largest: 0 };
      const v = r.type === "expense" ? Number(r.base_amount) : r.type === "refund" ? -Number(r.base_amount) : 0;
      s.total = round2(s.total + v);
      s.count += 1;
      s.first = !s.first || r.date < s.first ? r.date : s.first;
      s.last = !s.last || r.date > s.last ? r.date : s.last;
      const key = r.subcategory_id ?? `cat:${r.category_id}`;
      s.bySub[key] = round2((s.bySub[key] ?? 0) + v);
      s.largest = Math.max(s.largest, v);
      out.set(r.trip_id!, s);
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

export function tripDays(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
}
