import { round2 } from "@/lib/utils";

export type AllocItem = { key: string; total_price: number };

/**
 * Split a receipt total across groups in proportion to their item sums, so tax/discounts are shared
 * pro-rata and the parts add up to the receipt total exactly (last group absorbs rounding).
 */
export function allocate(items: AllocItem[], total: number): { key: string; amount: number; itemsSum: number }[] {
  const groups = new Map<string, number>();
  for (const i of items) groups.set(i.key, round2((groups.get(i.key) ?? 0) + i.total_price));
  const entries = [...groups.entries()].filter(([, v]) => v > 0);
  const itemsSum = entries.reduce((a, [, v]) => a + v, 0);
  if (!entries.length || itemsSum <= 0) return [];
  let used = 0;
  return entries.map(([key, v], idx) => {
    const amount = idx === entries.length - 1 ? round2(total - used) : round2((total * v) / itemsSum);
    used = round2(used + amount);
    return { key, amount, itemsSum: v };
  });
}
