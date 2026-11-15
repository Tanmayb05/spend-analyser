import "server-only";
import { requireUser } from "@/lib/supabase/server";
import type { LedgerRow } from "./types";

/** Smoothed view only: spread plans and EMIs become monthly installments (the only accounting mode the app exposes). */
export async function getLedger(from: string, to: string, includeExcludedTrips = false): Promise<LedgerRow[]> {
  const { supabase } = await requireUser();
  const all: LedgerRow[] = [];
  // PostgREST caps responses (default 1000 rows); page through.
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .rpc("ledger", { p_mode: "normalized", p_from: from, p_to: to, p_include_excluded_trips: includeExcludedTrips })
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

export type TransactionExtras = { external_url: string | null; notes: string | null };

/** Per-transaction link + notes (not on the ledger RPC); feeds the list's link chip and the detail panel. */
export async function getTransactionExtras(ids: (string | null)[]): Promise<Map<string, TransactionExtras>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const out = new Map<string, TransactionExtras>();
  if (!unique.length) return out;

  const { supabase } = await requireUser();
  for (let offset = 0; offset < unique.length; offset += 200) {
    const { data, error } = await supabase
      .from("transactions")
      .select("id,external_url,notes")
      .in("id", unique.slice(offset, offset + 200));
    if (error) throw new Error(error.message);
    for (const row of data ?? []) out.set(row.id, { external_url: row.external_url, notes: row.notes });
  }
  return out;
}
