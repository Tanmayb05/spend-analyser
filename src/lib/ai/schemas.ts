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
