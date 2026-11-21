import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TxnCandidate } from "./match";

type Db = Pick<SupabaseClient, "from">;

/**
 * Unlinked expense transactions that a receipt could belong to, with each merchant's saved aliases.
 * `from` and `to` (YYYY-MM-DD) bound the dates; the caller still ranks with `rankCandidates`.
 */
export async function loadCandidatePool(supabase: Db, range: { from?: string; to?: string } = {}): Promise<{ txns: TxnCandidate[]; paymentNames: Map<string, string> }> {
  let q = supabase
    .from("transactions")
    .select("id, date, amount, currency, type, receipt_id, payment_method_id, merchant:merchants(id, name)")
    .eq("type", "expense")
    .is("receipt_id", null)
    .order("date", { ascending: false })
    .limit(2000);
  if (range.from) q = q.gte("date", range.from);
  if (range.to) q = q.lte("date", range.to);
  const [{ data, error }, pms] = await Promise.all([q, supabase.from("payment_methods").select("id, name")]);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as {
    id: string;
    date: string;
    amount: number | string;
    currency: string;
    type: TxnCandidate["type"];
    receipt_id: string | null;
    payment_method_id: string | null;
    merchant: { id: string; name: string } | null;
  }[];

  const merchantIds = [...new Set(rows.map((t) => t.merchant?.id).filter(Boolean))] as string[];
  const aliasRows = merchantIds.length ? (((await supabase.from("merchant_aliases").select("merchant_id, alias").in("merchant_id", merchantIds)).data ?? []) as { merchant_id: string; alias: string }[]) : [];
  const aliases = new Map<string, string[]>();
  for (const a of aliasRows) aliases.set(a.merchant_id, [...(aliases.get(a.merchant_id) ?? []), a.alias]);

  const txns: TxnCandidate[] = rows.map((t) => ({
    id: t.id,
    date: t.date,
    amount: Number(t.amount),
    currency: t.currency.trim(),
    merchant: t.merchant?.name ?? null,
    payment_method_id: t.payment_method_id,
    receipt_id: t.receipt_id,
    type: t.type,
    aliases: t.merchant ? aliases.get(t.merchant.id) : undefined,
  }));
  const paymentNames = new Map(((pms.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  return { txns, paymentNames };
}

export const dayOffset = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);
