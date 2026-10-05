import { z } from "zod";

const uuid = z.string().uuid();
const optUuid = z.union([uuid, z.literal(""), z.null()]).optional().transform((v) => v || null);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

export const planSchema = z.union([
  z.object({ unchanged: z.literal(true) }),
  z.object({
    kind: z.enum(["spread", "emi"]),
    months: z.coerce.number().int().min(1, "At least 1 month").max(360),
    start_month: isoDate,
    installment_amount: z.coerce.number().positive().nullable().optional(),
    interest: z.coerce.number().min(0).optional().default(0),
  }),
]);

export const transactionSchema = z.object({
  id: optUuid,
  date: isoDate,
  type: z.enum(["expense", "income", "refund"]),
  category_id: z.string().uuid({ message: "Pick a category" }),
  subcategory_id: optUuid,
  merchant_name: z.string().trim().max(120).optional().default(""),
  description: z.string().trim().max(500).optional().default(""),
  amount: z.coerce.number({ message: "Enter an amount" }).positive("Amount must be more than 0").max(1e11),
  currency: z.string().regex(/^[A-Z]{3}$/),
  fx_rate: z.coerce.number().positive().nullable().optional(),
  payment_method_id: optUuid,
  paid_by_id: optUuid,
  trip_id: optUuid,
  receipt_id: optUuid,
  notes: z.string().trim().max(2000).optional().default(""),
  source: z.enum(["manual", "text", "receipt", "voice", "import"]).optional().default("manual"),
  plan: planSchema.nullable().optional().default(null),
});

export type TransactionInput = z.input<typeof transactionSchema>;
export type TransactionPayload = z.output<typeof transactionSchema>;
