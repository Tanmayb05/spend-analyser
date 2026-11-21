import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const parsedTxnSchema = z.object({
  date: isoDate.describe("YYYY-MM-DD. Resolve words like 'yesterday' relative to today."),
  type: z.enum(["expense", "income", "refund"]),
  amount: z.number().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/).describe("ISO 4217; use the default currency unless another is clearly stated (₹, rs, INR, €, ...)"),
  category: z.string().describe("Exactly one of the provided category names"),
  subcategory: z.string().nullable().describe("One of that category's subcategory names, or null"),
  merchant: z.string().nullable().describe("Store / payee name in Title Case, reuse a known merchant spelling when it matches"),
  description: z.string().nullable(),
  trip: z.string().nullable().describe("One of the provided trip names if the text clearly refers to it, else null"),
});

export const parseTextSchema = z.object({
  transactions: z.array(parsedTxnSchema).max(10),
  note: z.string().nullable().describe("Short note if something was ambiguous, else null"),
});
export type ParsedTxn = z.infer<typeof parsedTxnSchema>;

// The shape the rest of the app uses. It is NOT sent to the model: Claude rejects schemas with more than 16
// nullable fields, so the model gets `receiptSchema` below (0 / "" for "not shown") and `toExtraction` converts.
export const extractionSchema = z.object({
  merchant: z.string().nullable(),
  date: isoDate.nullable().describe("Date printed on the receipt. null when none is shown (app screenshots); never take it from a file name"),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  discount: z.number().nullable().describe("Receipt-level savings/discounts as a positive number (do not repeat coupons already netted into line totals)"),
  fees: z.number().nullable().describe("Delivery, fulfilment, service or bag fees as a positive number; null if none"),
  total: z.number().nullable().describe("The printed total charged, before any handwritten tip"),
  tip: z.number().nullable().describe("A tip amount that is printed or handwritten on the receipt. null for blank tip lines and suggested-tip tables"),
  tip_source: z.enum(["printed", "handwritten", "none"]),
  written_total: z.number().nullable().describe("A handwritten final total, when the customer wrote one; else null"),
  card_last4: z.string().regex(/^\d{4}$/).nullable().describe("Last 4 digits of the payment card only. Never a membership, loyalty or account number. null when not shown"),
  card_brand: z.string().nullable().describe("Card network or type as printed, e.g. Visa, Mastercard, Amex, Discover, Debit; null if not shown"),
  order_type: z.enum(["in_store", "delivery", "pickup", "online"]).nullable(),
  order_number: z.string().nullable(),
  store_address: z.string().nullable().describe("Street address of the store, one line; null if not shown"),
  printed_item_count: z.number().int().nullable().describe("The item count the receipt prints (e.g. 'Items: 12'), else null"),
  items: z
    .array(
      z.object({
        raw_name: z.string().describe("Line text as printed"),
        normalized_name: z.string().describe("Generic product name, singular, Title Case, no brand/size codes. e.g. 'Whole Milk', 'Bananas'"),
        item_category: z.string().describe("Product group such as Produce, Dairy, Meat, Bakery, Snacks, Beverages, Household, Personal Care, Electronics, Clothing"),
        quantity: z.number().nullable(),
        unit: z.string().nullable().describe("e.g. ea, lb, kg, gal"),
        unit_price: z.number().nullable(),
        total_price: z.number().describe("Line total after line discounts"),
        list_price: z.number().nullable().describe("Line total before coupons or markdowns when printed, else null"),
        line_discount: z.number().nullable().describe("Coupon or markdown on this line as a positive number, else null"),
        upc: z.string().nullable().describe("UPC or item number printed on the line, digits only; null if none"),
        tax_code: z.string().nullable().describe("Tax flag printed on the line (e.g. A, F, T); null if none"),
        is_weighted: z.boolean().describe("true when sold by weight (lb, kg, oz)"),
        category: z.string().describe("Exactly one of the provided expense category names"),
        subcategory: z.string().nullable(),
      }),
    )
    .max(300),
});
export type ReceiptExtraction = z.infer<typeof extractionSchema>;

// What the model is asked for. Every field is required (OpenAI strict mode) and at most 16 are nullable (Claude limit):
// optional amounts use 0 and optional text uses "" instead of null.
export const receiptSchema = z.object({
  merchant: z.string().nullable(),
  date: isoDate.nullable().describe("Date printed on the receipt. null when none is shown (app screenshots); never take it from a file name"),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  subtotal: z.number().describe("Printed subtotal; 0 if not shown"),
  tax: z.number().describe("Total tax; 0 if none or not shown"),
  discount: z.number().describe("Receipt-level savings/discounts as a positive number, not repeating coupons already netted into line totals; 0 if none"),
  fees: z.number().describe("Delivery, fulfilment, service or bag fees as a positive number; 0 if none"),
  total: z.number().nullable().describe("The printed total charged, before any handwritten tip"),
  tip: z.number().describe("A tip amount printed or handwritten on the receipt; 0 for blank tip lines and suggested-tip tables"),
  tip_source: z.enum(["printed", "handwritten", "none"]),
  written_total: z.number().describe("A handwritten final total, when the customer wrote one; else 0"),
  card_last4: z.string().regex(/^\d{4}$/).nullable().describe("Last 4 digits of the payment card only. Never a membership, loyalty or account number. null when not shown"),
  card_brand: z.string().describe("Card network or type as printed, e.g. Visa, Mastercard, Amex, Discover, Debit; empty string if not shown"),
  order_type: z.enum(["in_store", "delivery", "pickup", "online"]).nullable(),
  order_number: z.string().describe("Order or confirmation number; empty string if none"),
  store_address: z.string().describe("Street address of the store, one line; empty string if not shown"),
  printed_item_count: z.number().int().nullable().describe("The item count the receipt prints (e.g. 'Items: 12'), else null"),
  items: z
    .array(
      z.object({
        raw_name: z.string().describe("Line text as printed"),
        normalized_name: z.string().describe("Generic product name, singular, Title Case, no brand/size codes. e.g. 'Whole Milk', 'Bananas'"),
        item_category: z.string().describe("Product group such as Produce, Dairy, Meat, Bakery, Snacks, Beverages, Household, Personal Care, Electronics, Clothing"),
        quantity: z.number().nullable(),
        unit: z.string().nullable().describe("e.g. ea, lb, kg, gal"),
        unit_price: z.number().nullable(),
        total_price: z.number().describe("Line total after line discounts"),
        list_price: z.number().nullable().describe("Line total before coupons or markdowns when printed, else null"),
        line_discount: z.number().nullable().describe("Coupon or markdown on this line as a positive number, else null"),
        upc: z.string().nullable().describe("UPC or item number printed on the line, digits only; null if none"),
        tax_code: z.string().nullable().describe("Tax flag printed on the line (e.g. A, F, T); null if none"),
        is_weighted: z.boolean().describe("true when sold by weight (lb, kg, oz)"),
        category: z.string().describe("Exactly one of the provided expense category names"),
        subcategory: z.string().nullable(),
      }),
    )
    .max(300),
});
export type ReceiptRead = z.infer<typeof receiptSchema>;

const orNull = (n: number) => (n > 0 ? n : null);
const orNullText = (s: string) => (s.trim() ? s.trim() : null);

/** Model answer -> the nullable shape used everywhere else. */
export function toExtraction(r: ReceiptRead): ReceiptExtraction {
  return {
    ...r,
    subtotal: orNull(r.subtotal),
    tax: orNull(r.tax),
    discount: orNull(r.discount),
    fees: orNull(r.fees),
    tip: orNull(r.tip),
    written_total: orNull(r.written_total),
    card_brand: orNullText(r.card_brand),
    order_number: orNullText(r.order_number),
    store_address: orNullText(r.store_address),
  };
}

export const analysisSchema = z.object({
  headline: z.string().describe("One sentence, plain language, the most important takeaway"),
  summary: z.string().describe("2-3 sentences"),
  insights: z
    .array(
      z.object({
        title: z.string(),
        detail: z.string().describe("1-2 sentences with specific numbers"),
        metric: z.string().nullable().describe("A key figure like '$420' or '+18%'"),
        severity: z.enum(["good", "watch", "alert"]),
      }),
    )
    .min(2)
    .max(5),
  actions: z.array(z.string()).min(1).max(3).describe("Concrete next steps"),
});
export type Analysis = z.infer<typeof analysisSchema>;

// ---------------------------------------------------------------------------
// Phase 2-3: tidy-up. Rows are referenced by their index `i` in the prompt, never by database id.
// Every field is required (nullable where optional) so OpenAI strict mode accepts the schema.
// ---------------------------------------------------------------------------
export const categorizeSchema = z.object({
  categorized: z
    .array(
      z.object({
        i: z.number().int().describe("Row number from the input"),
        category: z.string().describe("Exactly one of the provided category names"),
        subcategory: z.string().nullable().describe("One of that category's subcategories, or null"),
        confidence: z.enum(["high", "medium", "low"]),
      }),
    )
    .max(60),
});
export type Categorized = z.infer<typeof categorizeSchema>;

export const merchantCleanupSchema = z.object({
  merchant_fixes: z
    .array(
      z.object({
        name: z.string().describe("A merchant name exactly as given in the input"),
        rename_to: z
          .string()
          .nullable()
          .describe("Clean brand name in Title Case if this is messy or a duplicate of another merchant (use the same rename_to for all duplicates); null to keep"),
        category: z.string().nullable().describe("Default expense category for this merchant if it has none and it's obvious; else null"),
        subcategory: z.string().nullable(),
      }),
    )
    .max(300),
});
export type MerchantCleanup = z.infer<typeof merchantCleanupSchema>;

export const itemNamesSchema = z.object({
  item_names: z
    .array(
      z.object({
        i: z.number().int(),
        normalized_name: z.string().describe("Generic product name, Title Case, no brand or size. Reuse an existing name when it's the same product"),
        item_category: z.string().describe("Produce, Dairy, Meat, Bakery, Snacks, Beverages, Household, Personal Care, Electronics, Clothing, or similar"),
      }),
    )
    .max(200),
});
export type ItemNames = z.infer<typeof itemNamesSchema>;

export const anomalySchema = z.object({
  explanations: z
    .array(
      z.object({
        i: z.number().int(),
        flag: z.boolean().describe("true if worth the user's attention; false if clearly expected (rent, planned purchase, two different items)"),
        reason: z.string().describe("One short sentence for the user, with the numbers"),
      }),
    )
    .max(40),
});
export type AnomalyExplanations = z.infer<typeof anomalySchema>;
