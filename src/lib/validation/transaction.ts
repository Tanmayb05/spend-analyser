import { z } from "zod";
import { MAX_BIWEEKLY } from "@/lib/biweekly";

const uuid = z.string().uuid();
const optUuid = z.union([uuid, z.literal(""), z.null()]).optional().transform((v) => v || null);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const externalUrl = z.string().trim().max(2048, "Link is too long").refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}, "Enter a full http:// or https:// link").transform((value) => value || null);

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

/** Income only: create `count` paychecks, one every 14 days starting on the transaction date. */
export const repeatSchema = z.object({
  kind: z.literal("biweekly"),
  count: z.coerce.number({ message: "Enter how many paychecks" }).int("Whole paychecks only").min(2, "At least 2 paychecks").max(MAX_BIWEEKLY, `At most ${MAX_BIWEEKLY} paychecks`),
});

export const transactionSchema = z
  .object({
  id: optUuid,
  date: isoDate,
  type: z.enum(["expense", "income", "refund"]),
  category_id: z.string().uuid({ message: "Pick a category" }),
  subcategory_id: optUuid,
  merchant_name: z.string().trim().max(120).optional().default(""),
  description: z.string().trim().max(500).optional().default(""),
  external_url: externalUrl.optional().default(""),
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
  repeat: repeatSchema.nullable().optional().default(null),
  })
  .superRefine((v, ctx) => {
    if (!v.repeat) return;
    if (v.type !== "income") ctx.addIssue({ code: "custom", path: ["repeat"], message: "Only income can repeat" });
    else if (v.id) ctx.addIssue({ code: "custom", path: ["repeat"], message: "Repeats apply to new transactions only" });
    else if (v.plan) ctx.addIssue({ code: "custom", path: ["repeat"], message: "Income can't be spread and repeat" });
    else if (v.trip_id) ctx.addIssue({ code: "custom", path: ["repeat"], message: "Trip transactions can't repeat" });
  });

export type TransactionInput = z.input<typeof transactionSchema>;
export type TransactionPayload = z.output<typeof transactionSchema>;
