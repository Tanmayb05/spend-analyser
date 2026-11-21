// Sample import file + column guide. One source of truth for the downloadable sample (xlsx/csv),
// its "How to fill" sheet and the on-page import guide. Pure: no I/O. A unit test imports the
// sample through the real parser, so the sample can't drift from what the importer accepts.

import { EXPORT_COLUMNS } from "@/lib/export";

export const TEMPLATE_COLUMNS = EXPORT_COLUMNS;

export type ColumnGuide = { column: (typeof EXPORT_COLUMNS)[number]; required: "required" | "recommended" | "optional"; accepts: string; example: string };

export const COLUMN_GUIDE: ColumnGuide[] = [
  { column: "Date", required: "required", accepts: "YYYY-MM-DD is safest. Also 05/01/2026 (the preview asks day-first or month-first if the file doesn't make it clear), 5 Jan 2026, Jan 5, 2026 or a real Excel date. Rows without a valid date are skipped.", example: "2026-01-05" },
  { column: "Type", required: "recommended", accepts: "Expense, Income or Refund. Bank words like Debit, Credit, Purchase or Return also work. Transfer and card Payment rows are skipped. Anything else is read from the sign of the amount.", example: "Expense" },
  { column: "Category", required: "recommended", accepts: "Any name. Blank rows go to Uncategorized, and AI tidy-up can sort them later.", example: "Groceries" },
  { column: "Subcategory", required: "optional", accepts: "Any name. Created under the category if new.", example: "Groceries" },
  { column: "Merchant", required: "optional", accepts: "Shop or payee. Also accepted as Payee or Vendor.", example: "Corner Market" },
  { column: "Description", required: "optional", accepts: "Free text, up to 500 characters. Also accepted as Details or Memo.", example: "Weekly shop" },
  { column: "Amount", required: "required", accepts: "A number such as 54.20, 1,234.50, 1.234,50, (54.20) or 54.20 CR. Currency symbols are ignored. A negative expense becomes a refund. Zero or blank rows are skipped. Bank files with separate Debit and Credit columns work in place of Amount.", example: "54.20" },
  { column: "Payment", required: "optional", accepts: "Payment method name, e.g. Cash or Credit Card. New names are created.", example: "Debit Card" },
  { column: "Paid By", required: "optional", accepts: "Person who paid. New names are added to People.", example: "Me" },
  { column: "Trip", required: "optional", accepts: "Trip or event tag. Trips are created from these.", example: "Lisbon 2026" },
  { column: "EMI", required: "optional", accepts: "Yes for installment rows. One row per installment; rows of the same plan are grouped.", example: "No" },
  { column: "Receipt", required: "optional", accepts: "A receipt file name or link, for your reference.", example: "" },
  { column: "Currency", required: "optional", accepts: "3-letter code such as USD or EUR. Blank uses your default currency. Amounts are not converted, so rows in other currencies count at face value.", example: "USD" },
  { column: "Original Amount", required: "optional", accepts: "Ignored on import. Present so exported files re-import unchanged.", example: "" },
  { column: "Notes", required: "optional", accepts: "Free text.", example: "" },
  { column: "Plan Kind", required: "optional", accepts: "For EMI rows: emi (default) or spread.", example: "" },
];

/** Plain-language rules shown on the page and on the sample's "How to fill" sheet. */
export const CLEAN_CHECKLIST = [
  "One header row, then one row per transaction. Lines above the header and totals below the data are skipped.",
  "Dates as YYYY-MM-DD are safest. For 05/01/2026 style dates the preview asks you to pick day-first or month-first when the file doesn't make it clear.",
  "Amounts can be plain, 1,234.50, 1.234,50, (45.00) or 45.00 CR. Files with separate Debit and Credit columns work too.",
  "Type is Expense, Income or Refund. Put refunds as Refund, or as a negative Amount.",
  "Fill Category where you can. Blank ones go to Uncategorized and AI tidy-up can sort them afterwards.",
  "For installments (EMI), add one row per installment, set EMI to Yes, and repeat the same merchant and description with the plan text, as in the sample.",
  "Rows that can't be read are skipped and listed in the preview, with the reason.",
  "Rows that match something you already have (same date, amount and merchant or description) are skipped unless you tick the box in the preview. To start over, use Reset or delete first.",
];

const row = (
  date: string, type: string, category: string, subcategory: string, merchant: string, description: string, amount: number | string,
  payment: string, paidBy: string, trip: string, emi: string, currency: string, notes = "", planKind = "",
): (string | number)[] => [date, type, category, subcategory, merchant, description, amount, payment, paidBy, trip, emi, "", currency, "", notes, planKind];

/** Example rows in EXPORT_COLUMNS order. */
export function templateRows(): (string | number)[][] {
  return [
    row("2026-01-03", "Income", "Income", "Salary", "Acme Corp", "January salary", 3200, "Bank Transfer", "Me", "", "No", "USD"),
    row("2026-01-05", "Expense", "Groceries", "Groceries", "Corner Market", "Weekly shop", 54.2, "Debit Card", "Me", "", "No", "USD"),
    row("2026-01-09", "Expense", "Dining & Drinks", "Coffee & Dessert", "Blue Bottle", "Coffee with Sam", 6.5, "Cash", "Me", "", "No", "USD", "Split with Sam"),
    row("2026-01-12", "Refund", "Shopping", "Clothing", "Northwind", "Returned jacket", 80, "Credit Card", "Me", "", "No", "USD"),
    row("2026-01-15", "Expense", "Travel", "Food", "Cafe Lisboa", "Dinner in Lisbon", 45, "Credit Card", "Me", "Lisbon 2026", "No", "EUR"),
    row("2026-01-20", "Expense", "", "", "Unknown Shop", "No category: lands in Uncategorized", 12.99, "Debit Card", "Me", "", "No", "USD"),
    row("2026-01-25", "Expense", "Shopping", "Electronics", "Northwind", "Laptop EMI 0 (plan $900.00 / 3)", 300, "Credit Card", "Me", "", "Yes", "USD", "", "emi"),
    row("2026-02-25", "Expense", "Shopping", "Electronics", "Northwind", "Laptop EMI 1 (plan $900.00 / 3)", 300, "Credit Card", "Me", "", "Yes", "USD", "", "emi"),
    row("2026-03-25", "Expense", "Shopping", "Electronics", "Northwind", "Laptop EMI 2 (plan $900.00 / 3)", 300, "Credit Card", "Me", "", "Yes", "USD", "", "emi"),
  ];
}
