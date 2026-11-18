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

export const receiptSchema = z.object({
  merchant: z.string().nullable(),
  date: isoDate.nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  discount: z.number().nullable().describe("Total savings/discounts as a positive number"),
  total: z.number().nullable().describe("Amount actually paid"),
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
        category: z.string().describe("Exactly one of the provided expense category names"),
        subcategory: z.string().nullable(),
      }),
    )
    .max(300),
});
export type ReceiptExtraction = z.infer<typeof receiptSchema>;

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
