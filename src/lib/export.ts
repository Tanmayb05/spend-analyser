// Builds export rows in the Expense Tracker column order (plus a few extras), so files round-trip
// through the importer. Spread/EMI plans expand to one row per installment with "(plan $X / N)" text.

export const EXPORT_COLUMNS = [
  "Date", "Type", "Category", "Subcategory", "Merchant", "Description", "Amount", "Payment", "Paid By",
  "Trip", "EMI", "Receipt", "Currency", "Original Amount", "Notes", "Plan Kind",
] as const;

export type ExportTxn = {
  date: string;
  type: string;
  category: string;
  subcategory: string | null;
  merchant: string | null;
  description: string | null;
  amount: number; // original currency
  currency: string;
  base_amount: number;
  payment: string | null;
  paid_by: string | null;
  trip: string | null;
  receipt: string | null;
  notes: string | null;
  plan: null | { kind: "spread" | "emi"; installments: { seq: number; due_date: string; amount_base: number }[] };
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const usd = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function exportRows(txns: ExportTxn[], baseCurrency: string): (string | number)[][] {
  const out: (string | number)[][] = [];
  for (const t of txns) {
    const common = [cap(t.type), t.category, t.subcategory ?? "", t.merchant ?? ""];
    const who = [t.payment ?? "", t.paid_by ?? "", t.trip ?? ""];
    if (!t.plan || !t.plan.installments.length) {
      out.push([
        t.date, ...common, t.description ?? "", t.base_amount, ...who, "No", t.receipt ?? "",
        baseCurrency, t.currency !== baseCurrency ? t.amount : "", t.notes ?? "", "",
      ]);
      continue;
    }
    const n = t.plan.installments.length;
    const planText = `(plan $${usd(t.base_amount)} / ${n})`;
    for (const i of t.plan.installments) {
      out.push([
        i.due_date, ...common, `${t.description ?? t.merchant ?? "Plan"} EMI ${i.seq - 1} ${planText}`, i.amount_base,
        ...who, "Yes", i.seq === 1 ? t.receipt ?? "" : "", baseCurrency, "", i.seq === 1 ? t.notes ?? "" : "", t.plan.kind,
      ]);
    }
  }
  return out.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}
