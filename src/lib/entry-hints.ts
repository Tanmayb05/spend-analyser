/** What the add form learns from recent history: the categories and merchants you use most, and what you last paid each merchant with. */
export type HintRow = {
  type: "expense" | "income" | "refund";
  category_id: string;
  subcategory_id: string | null;
  merchant_id: string | null;
  payment_method_id: string | null;
  paid_by_id: string | null;
};

export type MerchantLast = {
  category_id: string;
  subcategory_id: string | null;
  payment_method_id: string | null;
  paid_by_id: string | null;
};

export type EntryHints = {
  /** category ids, most used first, by form kind (refunds count as expenses) */
  topCategories: { expense: string[]; income: string[] };
  /** merchant ids, most used first */
  topMerchants: string[];
  /** category ids, most recently used first, by form kind */
  recentCategories: { expense: string[]; income: string[] };
  /** merchant ids, most recently used first */
  recentMerchants: string[];
  /** the most recent transaction for each merchant id */
  lastByMerchant: Record<string, MerchantLast>;
};

export const EMPTY_HINTS: EntryHints = {
  topCategories: { expense: [], income: [] },
  topMerchants: [],
  recentCategories: { expense: [], income: [] },
  recentMerchants: [],
  lastByMerchant: {},
};

const byCount = (counts: Map<string, number>, order: Map<string, number>) =>
  [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || order.get(a)! - order.get(b)!);

/** `rows` must be newest first. Ties go to whichever was used more recently. */
export function buildEntryHints(rows: HintRow[]): EntryHints {
  const cat = { expense: new Map<string, number>(), income: new Map<string, number>() };
  const merchants = new Map<string, number>();
  const seen = new Map<string, number>();
  const recentCat = { expense: [] as string[], income: [] as string[] };
  const recentMerchants: string[] = [];
  const lastByMerchant: Record<string, MerchantLast> = {};

  rows.forEach((r, i) => {
    const kind = r.type === "income" ? "income" : "expense";
    cat[kind].set(r.category_id, (cat[kind].get(r.category_id) ?? 0) + 1);
    if (!recentCat[kind].includes(r.category_id)) recentCat[kind].push(r.category_id);
    if (!seen.has(r.category_id)) seen.set(r.category_id, i);
    if (r.merchant_id) {
      merchants.set(r.merchant_id, (merchants.get(r.merchant_id) ?? 0) + 1);
      if (!recentMerchants.includes(r.merchant_id)) recentMerchants.push(r.merchant_id);
      if (!seen.has(r.merchant_id)) seen.set(r.merchant_id, i);
      if (!lastByMerchant[r.merchant_id]) {
        lastByMerchant[r.merchant_id] = {
          category_id: r.category_id,
          subcategory_id: r.subcategory_id,
          payment_method_id: r.payment_method_id,
          paid_by_id: r.paid_by_id,
        };
      }
    }
  });

  return {
    topCategories: { expense: byCount(cat.expense, seen), income: byCount(cat.income, seen) },
    topMerchants: byCount(merchants, seen),
    recentCategories: recentCat,
    recentMerchants,
    lastByMerchant,
  };
}
