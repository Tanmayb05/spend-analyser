import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
type Fns = Database["public"]["Functions"];
export type Enums = Database["public"]["Enums"];

export type Profile = Tables["profiles"]["Row"];
export type Category = Tables["categories"]["Row"];
export type Subcategory = Tables["subcategories"]["Row"];
export type Budget = Tables["budgets"]["Row"];
export type PaymentMethod = Tables["payment_methods"]["Row"];
export type Person = Tables["people"]["Row"];
export type Merchant = Tables["merchants"]["Row"];
export type Trip = Tables["trips"]["Row"];
export type Transaction = Tables["transactions"]["Row"];
export type SpreadPlan = Tables["spread_plans"]["Row"];
export type Installment = Tables["installments"]["Row"];
export type Receipt = Tables["receipts"]["Row"];
export type ReceiptItem = Tables["receipt_items"]["Row"];

export type LedgerRow = Fns["ledger"]["Returns"][number];
export type LedgerMode = Enums["ledger_mode"];
export type TxnType = Enums["txn_type"];
export type TripMode = Enums["trip_mode"];
export type PlanKind = Enums["plan_kind"];

export type ReferenceData = {
  userId: string;
  email: string;
  profile: Profile;
  categories: Category[];
  subcategories: Subcategory[];
  paymentMethods: PaymentMethod[];
  people: Person[];
  trips: Trip[];
  merchants: Merchant[];
  budgets: Budget[];
  today: string;
  aiReady: boolean;
};
