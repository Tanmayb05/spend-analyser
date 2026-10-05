import type { LedgerRow } from "@/lib/data/types";

export function row(p: Partial<LedgerRow> & { entry_date: string; amount: number }): LedgerRow {
  const type = p.type ?? "expense";
  const amount = p.amount;
  return {
    month: `${p.entry_date.slice(0, 7)}-01`,
    type,
    category_id: "groceries",
    subcategory_id: null as unknown as string,
    merchant_id: null as unknown as string,
    merchant_name: null as unknown as string,
    description: null as unknown as string,
    trip_id: null as unknown as string,
    txn_id: "t",
    payment_method_id: null as unknown as string,
    paid_by_id: null as unknown as string,
    receipt_id: null as unknown as string,
    spend: type === "expense" ? amount : type === "refund" ? -amount : 0,
    income: type === "income" ? amount : 0,
    is_core: true,
    is_scheduled: false,
    plan_kind: null as unknown as LedgerRow["plan_kind"],
    installment_seq: null as unknown as number,
    installment_count: null as unknown as number,
    is_lump: false,
    orig_amount: amount,
    orig_currency: "USD",
    ...p,
  } as LedgerRow;
}
