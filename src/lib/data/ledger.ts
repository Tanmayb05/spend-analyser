import "server-only";
import { requireUser } from "@/lib/supabase/server";
import type { LedgerMode, LedgerRow } from "./types";

export async function getLedger(mode: LedgerMode, from: string, to: string, includeExcludedTrips = false): Promise<LedgerRow[]> {
  const { supabase } = await requireUser();
  const all: LedgerRow[] = [];
  // PostgREST caps responses (default 1000 rows); page through.
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .rpc("ledger", { p_mode: mode, p_from: from, p_to: to, p_include_excluded_trips: includeExcludedTrips })
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return all.map((r) => ({ ...r, amount: Number(r.amount), spend: Number(r.spend), income: Number(r.income) }));
}

export async function getTransactionLinks(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const links = new Map<string, string>();
  if (!unique.length) return links;

  const { supabase } = await requireUser();
  for (let offset = 0; offset < unique.length; offset += 200) {
    const { data, error } = await supabase
      .from("transactions")
      .select("id,external_url")
      .in("id", unique.slice(offset, offset + 200))
      .not("external_url", "is", null);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (row.external_url) links.set(row.id, row.external_url);
    }
  }
  return links;
}

export function parseMode(v: unknown, fallback: LedgerMode): LedgerMode {
  return v === "cash" || v === "normalized" ? v : fallback;
}
