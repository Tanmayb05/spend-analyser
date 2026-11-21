import { round2 } from "@/lib/utils";

export type TotalsInput = {
  items: { total_price: number; quantity?: number | null }[];
  fees: number | null;
  tax: number | null;
  discount: number | null;
  total: number | null;
  printed_item_count: number | null;
};

export type TotalsCheck = { ok: boolean; itemsSum: number; expected: number | null; reasons: string[] };

/** Tolerance for rounding on per-line tax: one cent. */
const TOL = 0.011;

/**
 * items + fees + tax - discounts must equal the printed total (within a cent), and the item count must match when the
 * receipt prints one. A failure means the text layer or the read was incomplete, so the caller falls back to vision.
 */
export function checkTotals(e: TotalsInput): TotalsCheck {
  const reasons: string[] = [];
  const itemsSum = round2(e.items.reduce((a, i) => a + (Number(i.total_price) || 0), 0));
  if (e.total == null) reasons.push("No total found");
  if (!e.items.length) reasons.push("No items found");
  const expected = e.total == null ? null : round2(itemsSum + (e.fees ?? 0) + (e.tax ?? 0) - (e.discount ?? 0));
  if (e.items.length && e.total != null && Math.abs((expected as number) - e.total) > TOL)
    reasons.push(`Items, fees and tax add up to ${expected?.toFixed(2)} but the total is ${e.total.toFixed(2)}`);
  if (e.printed_item_count != null && e.items.length) {
    const units = Math.round(e.items.reduce((a, i) => a + (i.quantity && i.quantity > 0 ? Math.max(1, Math.round(i.quantity)) : 1), 0));
    if (e.items.length !== e.printed_item_count && units !== e.printed_item_count)
      reasons.push(`Receipt says ${e.printed_item_count} items but ${e.items.length} were read`);
  }
  return { ok: reasons.length === 0, itemsSum, expected, reasons };
}

/** Enough text to be worth sending to the model instead of images. */
export const MIN_TEXT_CHARS = 80;
export const hasTextLayer = (text: string) => text.replace(/\s+/g, "").length >= MIN_TEXT_CHARS;
