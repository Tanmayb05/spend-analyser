import type { ParsedTxn } from "@/lib/ai/schemas";
import type { Category, Subcategory } from "@/lib/data/types";

type Trip = { id: string; name: string; start_date: string | null; end_date: string | null };
type Payment = { id: string; name: string; nickname: string | null; issuer: string | null; network: string | null };
type Person = { id: string; name: string; is_self: boolean };

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Exact match on any label first, then a whole-word containment either way. Returns the item or undefined. */
export function matchByName<T>(items: T[], query: string | null | undefined, labels: (item: T) => Array<string | null | undefined>): T | undefined {
  const q = norm(query);
  if (!q) return undefined;
  const all = items.map((item) => ({ item, labels: labels(item).map(norm).filter(Boolean) }));
  const exact = all.filter((x) => x.labels.includes(q));
  if (exact.length) return exact.length === 1 ? exact[0].item : undefined; // two cards share "Amex": ambiguous
  const padded = ` ${q} `;
  const loose = all.filter((x) => x.labels.some((l) => l.length >= 3 && (padded.includes(` ${l} `) || ` ${l} `.includes(padded))));
  return loose.length === 1 ? loose[0].item : undefined; // two candidates = ambiguous, leave it for the user
}

export const paymentLine = (p: Payment) => {
  const extra = [p.nickname, [p.issuer, p.network].filter(Boolean).join(" ")].filter(Boolean).join("; ");
  return extra ? `${p.name} (${extra})` : p.name;
};

/** One parsed entry → the string preset the transaction form takes. Empty fields are left out so form defaults stay. */
export function toPreset(
  p: ParsedTxn,
  ctx: { cats: Category[]; subs: Subcategory[]; trips: Trip[]; payments: Payment[]; people: Person[] },
  category: { category_id: string; subcategory_id: string },
): Record<string, string> {
  const trip = matchByName(ctx.trips, p.trip, (t) => [t.name]);
  const pay = matchByName(ctx.payments, p.payment_method, (m) => [m.name, m.nickname, m.issuer, [m.issuer, m.network].filter(Boolean).join(" ")]);
  const who = matchByName(ctx.people, p.paid_by, (x) => [x.name]);
  return {
    date: p.date,
    type: p.type,
    amount: String(p.amount),
    currency: p.currency,
    ...category,
    merchant_name: p.merchant ?? "",
    description: p.description ?? "",
    ...(trip ? { trip_id: trip.id } : {}),
    ...(pay ? { payment_method_id: pay.id } : {}),
    ...(who ? { paid_by_id: who.id } : {}),
    ...(p.notes?.trim() ? { notes: p.notes.trim() } : {}),
    source: "text",
  };
}
