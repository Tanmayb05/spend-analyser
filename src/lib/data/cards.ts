import "server-only";
import { requireUser } from "@/lib/supabase/server";
import { getReferenceData } from "@/lib/data/reference";
import { minDueRule, summarizeCard, type CardCharge, type CardConfig, type CardPayment, type CardSummary } from "@/lib/cards";

type TxnRow = {
  id: string;
  date: string;
  type: "expense" | "income" | "refund";
  base_amount: number;
  payment_method_id: string;
  spread_plans: { kind: "spread" | "emi"; installments: { due_date: string; amount_base: number }[] } | null;
};

export type CardData = { summary: CardSummary; payments: CardPayment[]; last4s: string[] };

/** Every payment method marked as a credit card, with its balance, statement and payment history. */
export async function getCardData(): Promise<CardData[]> {
  const ref = await getReferenceData();
  const cards = ref.paymentMethods.filter((p) => p.is_credit_card);
  if (!cards.length) return [];
  const { supabase } = await requireUser();
  const ids = cards.map((c) => c.id);
  // only rows on or after the earliest tracking date matter; a card without one counts all history
  const from = cards.every((c) => c.tracking_from) ? cards.map((c) => c.tracking_from!).sort()[0] : null;

  const txns: TxnRow[] = [];
  for (let off = 0; ; off += 1000) {
    let q = supabase
      .from("transactions")
      .select("id, date, type, base_amount, payment_method_id, spread_plans(kind, installments(due_date, amount_base))")
      .in("payment_method_id", ids)
      .order("date")
      .range(off, off + 999);
    if (from) q = q.gte("date", from);
    const { data, error } = await q.returns<TxnRow[]>();
    if (error) throw new Error(error.message);
    txns.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const { data: pays, error } = await supabase.from("card_payments").select("id, payment_method_id, date, amount, note").order("date", { ascending: false });
  if (error) throw new Error(error.message);

  const { data: nums } = await supabase.from("payment_method_cards").select("payment_method_id, last4").in("payment_method_id", ids).order("created_at");

  return cards.map((c) => {
    const config: CardConfig = {
      id: c.id,
      name: c.name,
      credit_limit: c.credit_limit === null ? null : Number(c.credit_limit),
      statement_day: c.statement_day,
      due_day: c.due_day,
      opening_balance: Number(c.opening_balance),
      tracking_from: c.tracking_from,
      min_due: minDueRule(ref.profile.base_currency, c.min_due_pct === null ? null : Number(c.min_due_pct), c.min_due_floor === null ? null : Number(c.min_due_floor)),
    };
    const charges: CardCharge[] = txns
      .filter((t) => t.payment_method_id === c.id)
      .map((t) => {
        const emi = t.spread_plans?.kind === "emi" ? t.spread_plans.installments.map((i) => ({ due_date: i.due_date, amount: Number(i.amount_base) })) : undefined;
        const sign = t.type === "expense" ? 1 : -1;
        // an EMI's installments (with any interest) are what the card is eventually billed
        const amount = emi?.length ? emi.reduce((a, i) => a + i.amount, 0) : sign * Number(t.base_amount);
        return { id: t.id, date: t.date, amount, emi: emi?.length ? emi : undefined };
      });
    const payments: CardPayment[] = (pays ?? [])
      .filter((p) => p.payment_method_id === c.id)
      .map((p) => ({ id: p.id, date: p.date, amount: Number(p.amount), note: p.note }));
    return { summary: summarizeCard(config, charges, payments, ref.today), payments, last4s: (nums ?? []).filter((n) => n.payment_method_id === c.id).map((n) => n.last4) };
  });
}
