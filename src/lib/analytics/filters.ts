import type { LedgerRow, TxnType } from "@/lib/data/types";
import { round2 } from "@/lib/utils";

export type TxnFilters = {
  type: TxnType | null;
  categories: string[];
  subcategory: string | null;
  core: boolean;
  trip: string | null;
  merchant: string | null;
  payment: string | null;
  paidBy: string | null;
  receipt: boolean;
  plan: boolean;
  q: string;
};

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const uuidish = (s: string) => (/^[0-9a-f-]{36}$/i.test(s) ? s : null);

export function parseFilters(sp: Params): TxnFilters {
  const type = one(sp.type);
  return {
    type: type === "expense" || type === "income" || type === "refund" ? type : null,
    categories: one(sp.cat).split(",").map(uuidish).filter((x): x is string => Boolean(x)),
    subcategory: uuidish(one(sp.sub)),
    core: one(sp.core) === "1",
    trip: uuidish(one(sp.trip)),
    merchant: uuidish(one(sp.merchant)),
    payment: uuidish(one(sp.pay)),
    paidBy: uuidish(one(sp.by)),
    receipt: one(sp.receipt) === "1",
    plan: one(sp.plan) === "1",
    q: one(sp.q).trim().slice(0, 100),
  };
}

export function activeFilterCount(f: TxnFilters): number {
  return [f.type, f.categories.length, f.subcategory, f.core, f.trip, f.merchant, f.payment, f.paidBy, f.receipt, f.plan, f.q].filter(Boolean).length;
}

export function applyFilters(rows: LedgerRow[], f: TxnFilters, extraText?: (r: LedgerRow) => string): LedgerRow[] {
  const q = f.q.toLowerCase();
  return rows.filter((r) => {
    if (f.type && r.type !== f.type) return false;
    if (f.categories.length && !f.categories.includes(r.category_id)) return false;
    if (f.subcategory && r.subcategory_id !== f.subcategory) return false;
    if (f.core && !r.is_core) return false;
    if (f.trip && r.trip_id !== f.trip) return false;
    if (f.merchant && r.merchant_id !== f.merchant) return false;
    if (f.payment && r.payment_method_id !== f.payment) return false;
    if (f.paidBy && r.paid_by_id !== f.paidBy) return false;
    if (f.receipt && !r.receipt_id) return false;
    if (f.plan && !r.plan_kind) return false;
    if (q) {
      const hay = `${r.merchant_name ?? ""} ${r.description ?? ""} ${extraText?.(r) ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** The value a filtered view tracks: income when looking at income, otherwise net spend. */
export function metric(rows: LedgerRow[], f: TxnFilters): number {
  return round2(rows.reduce((a, r) => a + (f.type === "income" ? Number(r.income) : Number(r.spend)), 0));
}

export function breakdown(rows: LedgerRow[], key: (r: LedgerRow) => string | null, f: TxnFilters, limit = 5) {
  const acc = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    acc.set(k, (acc.get(k) ?? 0) + (f.type === "income" ? Number(r.income) : Number(r.spend)));
  }
  return [...acc.entries()].map(([k, v]) => ({ key: k, value: round2(v) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, limit);
}
