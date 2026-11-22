import { DEFAULT_BIWEEKLY } from "@/lib/biweekly";
import type { TransactionInput } from "@/lib/validation/transaction";
import type { PaymentMethod, PlanKind, Person, Profile, TxnType } from "@/lib/data/types";

/** Everything the add/edit form holds, as strings the way inputs hold them. Shared by the form and the describe-it cards. */
export type FormValues = {
  id: string | null;
  date: string;
  type: TxnType;
  amount: string;
  currency: string;
  fx_rate: string;
  category_id: string;
  subcategory_id: string;
  merchant_name: string;
  description: string;
  external_url: string;
  payment_method_id: string;
  paid_by_id: string;
  trip_id: string;
  receipt_id: string;
  notes: string;
  spread: boolean;
  plan_kind: PlanKind;
  plan_months: string;
  plan_amount: string;
  plan_start: string; // YYYY-MM
  plan_touched: boolean;
  repeat: boolean; // income only, new transactions only: bi-weekly paychecks
  repeat_count: string;
};

export type EntryDefaults = {
  people: Person[];
  paymentMethods: PaymentMethod[];
  profile: Profile;
  today: string;
  currency: string;
};

export type EntrySource = "manual" | "text" | "voice";

export function blankValues(app: EntryDefaults, preset?: Record<string, string>): FormValues {
  const self = app.people.find((p) => p.is_self);
  const defaultPm = app.paymentMethods.find((p) => p.id === app.profile.default_payment_method_id && !p.archived);
  return {
    id: null,
    date: app.today,
    type: "expense",
    amount: "",
    currency: app.currency,
    fx_rate: "",
    category_id: "",
    subcategory_id: "",
    merchant_name: "",
    description: "",
    external_url: "",
    payment_method_id: defaultPm?.id ?? "",
    paid_by_id: self?.id ?? "",
    trip_id: "",
    receipt_id: "",
    notes: "",
    spread: false,
    plan_kind: "spread",
    plan_months: String(app.profile.default_spread_months),
    plan_amount: "",
    plan_start: app.today.slice(0, 7),
    plan_touched: false,
    repeat: false,
    repeat_count: String(DEFAULT_BIWEEKLY),
    ...(preset as Partial<FormValues>),
    // presets are strings; "1" turns "Spread this cost" on (Plans / EMIs empty states)
    ...(preset?.spread ? { spread: preset.spread === "1" } : {}),
  };
}

/** The payload `saveTransaction` takes, built from form values. */
export function toSaveInput(v: FormValues, o: { editId?: string; source: string; baseCurrency: string }): TransactionInput {
  const foreign = v.currency !== o.baseCurrency;
  const repeating = !o.editId && v.type === "income" && v.repeat;
  const plan = !v.spread
    ? null
    : o.editId && !v.plan_touched
      ? { unchanged: true as const }
      : {
          kind: v.plan_kind,
          months: Number(v.plan_months),
          start_month: `${v.plan_start}-01`,
          installment_amount: Number(v.plan_amount) || null,
        };
  return {
    id: v.id,
    date: v.date,
    type: v.type,
    category_id: v.category_id,
    subcategory_id: v.subcategory_id,
    merchant_name: v.merchant_name,
    description: v.description,
    external_url: v.external_url,
    amount: v.amount,
    currency: v.currency,
    fx_rate: foreign && v.fx_rate ? Number(v.fx_rate) : null,
    payment_method_id: v.payment_method_id,
    paid_by_id: v.paid_by_id,
    trip_id: v.trip_id,
    receipt_id: v.receipt_id,
    notes: v.notes,
    source: o.editId ? undefined : (o.source as EntrySource),
    plan,
    repeat: repeating ? { kind: "biweekly", count: Number(v.repeat_count) } : null,
  } as TransactionInput;
}
