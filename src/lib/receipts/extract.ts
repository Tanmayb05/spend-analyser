import { round2 } from "@/lib/utils";
import type { ReceiptExtraction } from "@/lib/ai/schemas";
import { stripMemberNumbers } from "./card";

/**
 * Receipt label from a file name: "2025 09 11 - Antara Gift 1.pdf" -> "Antara Gift 1".
 * Camera and screenshot names (IMG_0412, Screenshot 2026-...) carry no meaning, so they give no label.
 * The label is never written to transaction notes.
 */
export function labelFromFileName(name: string | null | undefined): string | null {
  if (!name) return null;
  let s = name.replace(/\.[A-Za-z0-9]{2,5}$/, "").replace(/[_]+/g, " ");
  s = s.replace(/^\s*\d{4}[ .\-/]\d{1,2}[ .\-/]\d{1,2}\s*[-–—:]?\s*/, "").replace(/\s*[-–—]\s*\d{4}[ .\-/]\d{1,2}[ .\-/]\d{1,2}\s*$/, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s || s.length < 2) return null;
  if (/^(img|image|dsc|pxl|photo|scan|screenshot|screen shot|receipt|document|download)\b[ \d.\-()]*/i.test(s) && !/[a-z]{3,}\s+[a-z]{3,}/i.test(s.replace(/^(img|image|dsc|pxl|photo|scan|screenshot|screen shot|receipt|document|download)\b/i, ""))) return null;
  if (/^[\d\s\-().]+$/.test(s)) return null;
  return s.slice(0, 120);
}

/** An extraction stored before the v2 schema may lack the new fields: fill them so the rest of the code can rely on them. */
export function normalizeExtraction(raw: unknown): ReceiptExtraction {
  const r = (raw ?? {}) as Partial<ReceiptExtraction>;
  return {
    merchant: r.merchant ?? null,
    date: r.date ?? null,
    currency: r.currency ?? null,
    subtotal: r.subtotal ?? null,
    tax: r.tax ?? null,
    discount: r.discount ?? null,
    fees: r.fees ?? null,
    total: r.total ?? null,
    tip: r.tip ?? null,
    tip_source: r.tip_source ?? "none",
    written_total: r.written_total ?? null,
    card_last4: r.card_last4 ?? null,
    card_brand: r.card_brand ?? null,
    order_type: r.order_type ?? null,
    order_number: r.order_number ?? null,
    store_address: r.store_address ?? null,
    printed_item_count: r.printed_item_count ?? null,
    items: (r.items ?? []).map((i) => ({
      ...i,
      list_price: i.list_price ?? null,
      line_discount: i.line_discount ?? null,
      upc: i.upc ?? null,
      tax_code: i.tax_code ?? null,
      is_weighted: i.is_weighted ?? false,
    })),
  };
}

/** Amount the card was charged: the written total when read, else the printed total plus a written tip. */
export function totalPaidOf(e: Pick<ReceiptExtraction, "total" | "tip" | "tip_source" | "written_total">): number | null {
  if (e.total == null) return null;
  if (e.tip_source === "handwritten" && e.tip != null && e.tip > 0) {
    const plus = round2(e.total + e.tip);
    // a written total that is lower than the printed one is a misread; trust the tip
    return e.written_total != null && e.written_total >= e.total ? round2(e.written_total) : plus;
  }
  return round2(e.total);
}

/** Never keep membership or loyalty numbers: scrub every free-text field the model returned. */
export function scrubExtraction(e: ReceiptExtraction): ReceiptExtraction {
  const clean = (s: string | null) => (s == null ? s : stripMemberNumbers(s));
  return {
    ...e,
    merchant: clean(e.merchant),
    order_number: clean(e.order_number),
    store_address: clean(e.store_address),
    items: e.items.map((i) => ({ ...i, raw_name: stripMemberNumbers(i.raw_name) })),
  };
}

/** What the user confirmed in review, in the stored extraction shape, so a receipt reopened from the inbox shows their edits. */
export type ReviewedReceipt = {
  merchant: string;
  date: string;
  currency: string;
  subtotal: number | null;
  tax: number | null;
  discount: number | null;
  fees: number | null;
  total: number;
  tip: number | null;
  tipSource: ReceiptExtraction["tip_source"];
  cardLast4: string | null;
  cardBrand: string | null;
  orderType: ReceiptExtraction["order_type"];
  orderNumber: string | null;
  storeAddress: string | null;
  items: (Omit<ReceiptExtraction["items"][number], "category" | "subcategory" | "normalized_name" | "item_category"> & {
    normalized_name: string | null;
    item_category: string | null;
    category_id: string;
    subcategory_id: string;
  })[];
};

export function extractionFromReview(prev: ReceiptExtraction, d: ReviewedReceipt, names: (categoryId: string, subcategoryId: string) => { category: string; subcategory: string | null }): ReceiptExtraction {
  return {
    ...prev,
    merchant: d.merchant || null,
    date: d.date,
    currency: d.currency,
    subtotal: d.subtotal,
    tax: d.tax,
    discount: d.discount,
    fees: d.fees,
    total: d.total,
    tip: d.tip,
    tip_source: d.tipSource,
    card_last4: d.cardLast4,
    card_brand: d.cardBrand,
    order_type: d.orderType,
    order_number: d.orderNumber,
    store_address: d.storeAddress,
    items: d.items.map((i) => {
      const { category_id, subcategory_id, ...rest } = i;
      const n = names(category_id, subcategory_id);
      return { ...rest, normalized_name: i.normalized_name ?? i.raw_name, item_category: i.item_category ?? "", category: n.category, subcategory: n.subcategory };
    }),
  };
}
