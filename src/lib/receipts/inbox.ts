import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rankCandidates, type ReceiptTarget } from "./match";
import { dayOffset, loadCandidatePool } from "./pool";
import { round2 } from "@/lib/utils";

export type InboxReceipt = {
  id: string;
  merchant: string | null;
  date: string | null;
  total: number;
  currency: string;
  label: string | null;
  cardLast4: string | null;
  paymentName: string | null;
  pages: number;
  linkedCount: number;
  /** linked so far for a split order, receipt currency */
  matched: number;
  partial: boolean;
  /** unlinked transactions that look like this receipt */
  suggestions: number;
  top: { merchant: string | null; date: string; amount: number; currency: string } | null;
};

type Db = Pick<SupabaseClient, "from">;

type Row = {
  id: string;
  merchant_name: string | null;
  purchased_at: string | null;
  total: number | string | null;
  total_paid: number | string | null;
  currency: string | null;
  label: string | null;
  card_last4: string | null;
  payment_method_id: string | null;
  order_type: ReceiptTarget["order_type"];
  created_at: string;
  receipt_pages: { id: string }[];
};

/** Receipts waiting for a transaction (parked or only partly matched), newest first, those with a likely match on top. */
export async function loadInbox(supabase: Db, base: string): Promise<InboxReceipt[]> {
  const { data, error } = await supabase
    .from("receipts")
    .select("id, merchant_name, purchased_at, total, total_paid, currency, label, card_last4, payment_method_id, order_type, created_at, receipt_pages(id)")
    .eq("status", "inbox")
    .order("purchased_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Row[];
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const linked = ((await supabase.from("transactions").select("receipt_id, amount, currency").in("receipt_id", ids)).data ?? []) as { receipt_id: string; amount: number | string; currency: string }[];
  const dates = rows.map((r) => r.purchased_at).filter((d): d is string => !!d).sort();
  const { txns, paymentNames } = await loadCandidatePool(supabase, dates.length ? { from: dayOffset(dates[0], -14), to: dayOffset(dates.at(-1)!, 14) } : {});

  const out = rows.map((r): InboxReceipt => {
    const currency = (r.currency ?? base).trim();
    const total = Number(r.total ?? 0);
    const mine = linked.filter((l) => l.receipt_id === r.id);
    const matched = round2(mine.filter((l) => l.currency.trim() === currency).reduce((a, l) => a + Number(l.amount), 0));
    const paid = r.total_paid != null ? Number(r.total_paid) : null;
    const ranked = total > 0 ? rankCandidates({ date: r.purchased_at, total, total_paid: paid && paid > total ? paid : null, currency, merchant: r.merchant_name, payment_method_id: r.payment_method_id, order_type: r.order_type }, txns, { limit: 20 }) : [];
    const top = ranked[0]?.txn;
    return {
      id: r.id,
      merchant: r.merchant_name,
      date: r.purchased_at,
      total,
      currency,
      label: r.label,
      cardLast4: r.card_last4,
      paymentName: r.payment_method_id ? (paymentNames.get(r.payment_method_id) ?? null) : null,
      pages: Math.max(1, r.receipt_pages.length),
      linkedCount: mine.length,
      matched,
      partial: mine.length > 0,
      suggestions: ranked.length,
      top: top ? { merchant: top.merchant, date: top.date, amount: top.amount, currency: top.currency } : null,
    };
  });
  return out.sort((a, b) => Number(b.suggestions > 0) - Number(a.suggestions > 0));
}
