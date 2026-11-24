import { monogram } from "@/lib/monogram";
import { hashString } from "@/lib/trip-stamp";
import { round2 } from "@/lib/utils";

/**
 * Settle-up maths from "Paid by" alone. The schema has no splits, so the assumptions are:
 *  - Every expense is your own spend. When someone else is "Paid by", they fronted it and you owe them that amount.
 *  - A refund tagged to a person went back to them, so it cancels part of what they fronted.
 *    If refunds exceed what they fronted, they are holding your money and owe you the difference.
 *  - An expense with no payer, or "Paid by" you, is you paying (it creates no debt either way).
 *  - Income is not spending and is ignored.
 * Net is in base currency: positive means you owe them, negative means they owe you.
 */

export type SettleTxn = { type: "expense" | "income" | "refund"; paid_by_id: string | null; base_amount: number | null };
export type SettlePerson = { id: string; name: string; is_self?: boolean | null };

export type SettleRow = {
  id: string;
  name: string;
  initials: string;
  /** chart token number 1..8 */
  color: number;
  /** Expenses they paid. */
  fronted: number;
  /** Refunds that went back to them. */
  refunded: number;
  /** fronted - refunded: positive, you owe them; negative, they owe you. */
  net: number;
  /** Bar halves as 0..1 of the widest bar on the page: you paid (left), they paid (right). */
  youShare: number;
  theyShare: number;
};

export type SettleUp = {
  /** Expenses you paid (self or no payer), net of refunds to you. */
  youPaid: number;
  rows: SettleRow[];
  /** Sum of every net: what you owe overall (negative = owed to you). */
  totalNet: number;
};

export function settleUp(txns: SettleTxn[], people: SettlePerson[]): SettleUp {
  const byId = new Map(people.map((p) => [p.id, p]));
  const acc = new Map<string, { fronted: number; refunded: number }>();
  let youPaid = 0;
  for (const t of txns) {
    if (t.type === "income") continue;
    const amt = Number(t.base_amount ?? 0);
    const person = t.paid_by_id ? byId.get(t.paid_by_id) : undefined;
    const sign = t.type === "refund" ? -1 : 1;
    // Unknown id (person deleted) is cleared to null by the database, so treat it like "you" too.
    if (!person || person.is_self) {
      youPaid += sign * amt;
      continue;
    }
    const a = acc.get(person.id) ?? { fronted: 0, refunded: 0 };
    if (t.type === "refund") a.refunded += amt;
    else a.fronted += amt;
    acc.set(person.id, a);
  }
  youPaid = round2(youPaid);

  const base = [...acc.entries()].map(([id, a]) => {
    const p = byId.get(id)!;
    const fronted = round2(a.fronted);
    const refunded = round2(a.refunded);
    return { id, name: p.name, fronted, refunded, net: round2(fronted - refunded) };
  });
  const widest = Math.max(Math.max(youPaid, 0), ...base.map((r) => r.fronted), 0);
  const rows: SettleRow[] = base
    .map((r) => ({
      ...r,
      initials: monogram(r.name),
      color: 1 + (hashString(r.name.toLowerCase()) % 8),
      youShare: widest > 0 ? Math.max(youPaid, 0) / widest : 0,
      theyShare: widest > 0 ? r.fronted / widest : 0,
    }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name));
  return { youPaid, rows, totalNet: round2(rows.reduce((s, r) => s + r.net, 0)) };
}

/** One plain sentence for a row. `amount` is the already formatted absolute net. */
export function settleSentence(name: string, net: number, amount: string): string {
  if (net > 0) return `You owe ${name} ${amount}`;
  if (net < 0) return `${name} owes you ${amount}`;
  return `You and ${name} are settled`;
}
