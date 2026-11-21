// Parses the Expense Tracker workbook (or any bank/CSV export with similar columns) into an import_bundle payload.
// Pure: takes SheetJS-style row arrays, no I/O, so it runs in the browser and in tests.
//
// Rules of thumb:
//  - a bad row is skipped with a specific reason, it never fails the file
//  - anything locale-dependent (date order, decimal mark, sign convention) is inferred from the whole file,
//    shown to the user, and can be overridden; when the evidence is ambiguous the report asks (needsInput)
//  - nothing is emitted that the database would reject (real dates, lengths, positive amounts)

import {
  LIMITS,
  clean,
  fit,
  mapType,
  normHeader,
  normKey,
  parseAmount,
  parseDate,
  round2,
  scanDateOrder,
  scanDecimalMark,
  str,
  SUMMARY_ROW,
  type Amt,
  type Cell,
  type DateOrder,
  type DecimalMark,
} from "./values";

export type { Cell, DateOrder, DecimalMark };
export type Rows = Cell[][];

export type ImportCategory = {
  name: string;
  kind: "expense" | "income";
  is_core: boolean;
  color: string | null;
  budget: number;
  description: string | null;
  subcategories: string[];
  sort_order: number;
};

export type ImportTxn = {
  ref: string;
  date: string;
  type: "expense" | "income" | "refund";
  category: string;
  subcategory: string | null;
  merchant: string | null;
  description: string | null;
  amount: number;
  currency?: string;
  payment: string | null;
  paid_by: string | null;
  trip: string | null;
  receipt_file: string | null;
  notes?: string | null;
};

export type ImportPlan = {
  ref: string;
  kind: "spread" | "emi";
  months: number;
  start_month: string;
  installments: { seq: number; due_date: string; amount: number }[];
};

export type ImportTrip = { name: string; start_date: string | null; end_date: string | null; include_mode: "excluded" | "itemized" | "lump_sum" };

export type ImportBundle = {
  replace_defaults: boolean;
  budget_month: string;
  categories: ImportCategory[];
  payment_methods: string[];
  people: string[];
  trips: ImportTrip[];
  transactions: ImportTxn[];
  plans: ImportPlan[];
};

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export type FieldKey =
  | "date" | "type" | "category" | "subcategory" | "merchant" | "description" | "amount" | "debit" | "credit"
  | "currency" | "payment" | "paidBy" | "trip" | "emi" | "receipt" | "notes" | "planKind";

export const FIELD_LABELS: Record<FieldKey, string> = {
  date: "Date", type: "Type", category: "Category", subcategory: "Subcategory", merchant: "Merchant", description: "Description",
  amount: "Amount", debit: "Debit (money out)", credit: "Credit (money in)", currency: "Currency", payment: "Payment", paidBy: "Paid by",
  trip: "Trip", emi: "EMI", receipt: "Receipt", notes: "Notes", planKind: "Plan kind",
};

/** Header names (normalised: lowercase words) per field, best match first. Exported so the guide and tests can check them. */
export const ALIASES: Record<FieldKey, string[]> = {
  date: ["date", "transaction date", "trans date", "txn date", "posting date", "posted date", "date posted", "post date", "posted", "booking date", "value date", "settlement date"],
  type: ["type", "transaction type", "txn type", "dr cr", "cr dr", "debit credit"],
  category: ["category"],
  subcategory: ["subcategory", "sub category"],
  merchant: ["merchant", "payee", "vendor", "merchant name", "counterparty", "name"],
  description: ["description", "details", "memo", "narrative", "transaction description", "particulars", "remarks", "reference"],
  amount: ["amount", "value", "transaction amount"],
  debit: ["debit", "withdrawal", "withdrawals", "paid out", "money out", "outflow", "debit amount", "withdrawal amount", "dr"],
  credit: ["credit", "deposit", "deposits", "paid in", "money in", "inflow", "credit amount", "deposit amount", "cr"],
  currency: ["currency"],
  payment: ["payment", "payment method", "account", "card"],
  paidBy: ["paid by", "paidby"],
  trip: ["trip", "event"],
  emi: ["emi", "installment", "instalment"],
  receipt: ["receipt"],
  notes: ["notes", "note"],
  planKind: ["plan kind"],
};

const FIELDS = Object.keys(ALIASES) as FieldKey[];
const ALIAS_INDEX = new Map<string, [FieldKey, number][]>();
for (const f of FIELDS) ALIASES[f].forEach((a, i) => ALIAS_INDEX.set(a, [...(ALIAS_INDEX.get(a) ?? []), [f, i]]));

export type ColumnMap = Record<FieldKey, number>;

/** Map each field to the best-matching column of a header row (-1 if none). The first column wins on ties. */
export function matchColumns(row: Cell[]): { columns: ColumnMap; duplicates: string[] } {
  const columns = Object.fromEntries(FIELDS.map((f) => [f, -1])) as ColumnMap;
  const rank = Object.fromEntries(FIELDS.map((f) => [f, Infinity])) as Record<FieldKey, number>;
  const seen = new Map<string, number>();
  const duplicates: string[] = [];
  row.forEach((cell, i) => {
    const h = normHeader(cell);
    if (!h) return;
    seen.set(h, (seen.get(h) ?? 0) + 1);
    if (seen.get(h) === 2 && ALIAS_INDEX.has(h)) duplicates.push(str(cell));
    for (const [f, r] of ALIAS_INDEX.get(h) ?? []) {
      if (r < rank[f]) {
        rank[f] = r;
        columns[f] = i;
      }
    }
  });
  return { columns, duplicates };
}

const hasMoney = (c: ColumnMap) => c.amount >= 0 || c.debit >= 0 || c.credit >= 0;
const matched = (c: ColumnMap) => FIELDS.filter((f) => c[f] >= 0).length;

/** First row (within the first 200) holding a date column and a money column. */
export function findHeader(rows: Rows): { row: number; score: number; columns: ColumnMap; duplicates: string[] } | null {
  const limit = Math.min(rows.length, 200);
  for (let i = 0; i < limit; i++) {
    const { columns, duplicates } = matchColumns(rows[i] ?? []);
    if (columns.date >= 0 && hasMoney(columns)) return { row: i, score: matched(columns), columns, duplicates };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Options and helpers
// ---------------------------------------------------------------------------

export type SignMode = "bank" | "positive-spend";

export type ParseOptions = {
  /** Override the inferred date order. */
  dateOrder?: DateOrder;
  /** Override the inferred decimal mark. */
  decimalMark?: DecimalMark;
  /** bank: negative = spending, positive = income. positive-spend: positive = spending, negative = refund. */
  signMode?: SignMode;
  /** Override detected columns by index (-1 = ignore that field). */
  columns?: Partial<ColumnMap>;
  /** Workbook uses the 1904 date system. */
  date1904?: boolean;
  /** Your default currency; rows in another currency raise a warning. */
  baseCurrency?: string;
};

export type Skipped = { row: number; reason: string; detail?: string };
export type ImportWarning = { kind: string; message: string; rows: number[] };

/** Excel serial (1900 system) or any recognised date text → YYYY-MM-DD. Slash dates are read month-first unless told otherwise. */
export function toIsoDate(v: Cell, order: DateOrder = "mdy", date1904 = false): string | null {
  return parseDate(v, { order, date1904 });
}

const NON_CORE = new Set(["education", "travel", "rent & utilities", "income", "housing & utilities"]);
export const UNCATEGORIZED = "Uncategorized";
export const UNCATEGORIZED_INCOME = "Uncategorized income";

const blank = (v: Cell) => str(v) === "";

/** Keep the first spelling of a name and fold later spellings ("food", "FOOD ") into it. */
function canonicalizer(seed: string[] = []) {
  const m = new Map<string, string>();
  for (const s of seed) if (!m.has(normKey(s))) m.set(normKey(s), s);
  return (v: string | null): string | null => {
    if (!v) return v;
    const k = normKey(v);
    let c = m.get(k);
    if (c === undefined) {
      c = v;
      m.set(k, c);
    }
    return c;
  };
}

// ---------------------------------------------------------------------------
// Settings sheet
// ---------------------------------------------------------------------------
type Settings = {
  categories: Omit<ImportCategory, "color">[];
  trips: { name: string; start: string | null; end: string | null }[];
  payment_methods: string[];
  people: string[];
  trackingStart: string | null;
};

const budgetNumber = (v: Cell) => {
  const a = parseAmount(v, ".");
  return a ? round2(a.value) : 0;
};

/** The Expense Tracker Settings sheet. Returns null when the sheet isn't in that layout (so nothing gets replaced). */
export function parseSettings(rows: Rows): Settings | null {
  const out: Settings = { categories: [], trips: [], payment_methods: [], people: [], trackingStart: null };
  const hRow = rows.findIndex((r) => r.some((c) => str(c) === "Category") && r.some((c) => str(c).startsWith("Monthly Budget")));
  if (hRow < 0) return null;
  const h = rows[hRow].map(str);
  const col = (label: string, after = 0) => h.findIndex((x, i) => i >= after && x === label);
  const cName = col("Category");
  const cType = col("Type");
  const cBudget = h.findIndex((x) => x.startsWith("Monthly Budget"));
  const cSubs = col("Subcategories in use");
  const cDesc = col("What belongs here");
  const cTrip = col("Trip / Event tag");
  const cStart = h.findIndex((x) => x.startsWith("Start"));
  const cEnd = h.findIndex((x) => x.startsWith("End"));
  const cPay = col("Payment method");
  const cPerson = col("Person");
  const ctx = { order: "mdy" as const };

  let catDone = false;
  let tripsDone = false;
  for (let r = hRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const name = str(row[cName]);
    if (!catDone) {
      if (!name || name === "GENERAL") catDone = true;
      else
        out.categories.push({
          name: fit(name, LIMITS.category).value ?? name,
          kind: str(row[cType]).toLowerCase() === "income" ? "income" : "expense",
          is_core: !NON_CORE.has(name.toLowerCase()),
          budget: budgetNumber(row[cBudget]),
          description: fit(str(row[cDesc]) || null, LIMITS.description).value,
          subcategories: str(row[cSubs]).split(",").map((s) => fit(s.trim(), LIMITS.subcategory).value ?? "").filter(Boolean),
          sort_order: out.categories.length + 1,
        });
    }
    if (cTrip >= 0 && str(row[cTrip]) === "GENERAL") tripsDone = true;
    if (!tripsDone && cTrip >= 0 && str(row[cTrip])) {
      out.trips.push({ name: fit(str(row[cTrip]), LIMITS.trip).value ?? "", start: parseDate(row[cStart], ctx), end: parseDate(row[cEnd], ctx) });
    }
    if (cPay >= 0 && str(row[cPay])) out.payment_methods.push(fit(str(row[cPay]), LIMITS.payment).value ?? "");
    if (cPerson >= 0 && str(row[cPerson])) out.people.push(fit(str(row[cPerson]), LIMITS.person).value ?? "");
    const ts = row.findIndex((c) => str(c) === "Tracking starts");
    if (ts >= 0) out.trackingStart = parseDate(row[ts + 1], ctx);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Expenses sheet
// ---------------------------------------------------------------------------
const PLAN_RE = /\s*\(plan\s+[^)]*\)\s*/i;
const EMI_RE = /\s+EMI\s+\d+\s*$/i;

/**
 * Key that groups installment rows of the same plan. With "(plan $X / N)" text, merchant + plan text
 * identify the plan (descriptions of individual installments may differ); otherwise the base name does.
 */
export function planKey(description: string, merchant: string | null): string {
  const plan = description.match(PLAN_RE)?.[0].trim().toLowerCase() ?? "";
  const m = (merchant ?? "").toLowerCase();
  if (plan) return `${m}|${plan}`;
  return `${m}|${description.replace(EMI_RE, "").trim().toLowerCase()}`;
}

export function planBaseName(description: string): string {
  return description.replace(PLAN_RE, " ").replace(EMI_RE, "").trim();
}

export type Detected = {
  /** 1-based row number of the header in the file. */
  headerRow: number;
  headers: string[];
  columns: ColumnMap;
  amountStyle: "single" | "split";
  dateOrder: { value: DateOrder; state: "known" | "ambiguous" | "mixed" | "none" | "chosen"; samples: { raw: string; iso: string | null }[] };
  decimalMark: { value: DecimalMark; state: "known" | "conflict" | "none" | "chosen" };
  signMode: { value: SignMode; source: "type" | "inferred" | "chosen" | "not-needed" };
};

type Parsed = ImportTxn & { emi: boolean; row: number; planKind: "spread" | "emi" };

class Warnings {
  private m = new Map<string, ImportWarning>();
  add(kind: string, message: string, row?: number) {
    const w = this.m.get(kind) ?? { kind, message, rows: [] };
    if (row !== undefined) w.rows.push(row);
    this.m.set(kind, w);
  }
  list() {
    return [...this.m.values()];
  }
}

export function parseExpenses(rows: Rows, opts: ParseOptions = {}) {
  const hdr = findHeader(rows);
  if (!hdr) throw new Error("Couldn't find a header row. The file needs a Date column and an Amount column (or Debit and Credit columns).");
  const col: ColumnMap = { ...hdr.columns };
  for (const [k, v] of Object.entries(opts.columns ?? {})) if (v !== undefined) col[k as FieldKey] = v;
  const split = col.amount < 0;
  const warnings = new Warnings();
  for (const d of hdr.duplicates) warnings.add("duplicate-header", `Column "${d}" appears more than once; the first one is used`);

  const data: { r: number; row: Cell[] }[] = [];
  for (let r = hdr.row + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (!row.every(blank)) data.push({ r, row });
  }
  // a column override can leave the file unreadable: report it instead of throwing, so the panel stays up to fix it
  if (col.date < 0 || !hasMoney(col)) {
    warnings.add("columns", "Choose a Date column and an Amount column (or Debit and Credit columns)");
    data.length = 0;
  }

  // infer file-wide settings
  const dateScan = scanDateOrder(data.map((d) => d.row[col.date]));
  const moneyCells = (row: Cell[]) => (split ? [row[col.debit], row[col.credit]] : [row[col.amount]]);
  const decScan = scanDecimalMark(data.flatMap((d) => moneyCells(d.row)));
  const order = opts.dateOrder ?? dateScan.order;
  const mark = opts.decimalMark ?? decScan.mark;
  const ctx = { order, date1904: opts.date1904 };

  // sign convention: only needed for single-amount rows without a recognised type
  let signMode: SignMode = "positive-spend";
  let signSource: Detected["signMode"]["source"] = "type";
  if (split) signSource = "not-needed";
  else {
    let neg = 0;
    let pos = 0;
    let untyped = 0;
    for (const { row } of data) {
      if (!parseDate(row[col.date], ctx)) continue; // footer totals and notes aren't transactions
      const t = col.type >= 0 ? mapType(row[col.type]) : "blank";
      if (t !== "blank" && t !== "unknown") continue;
      untyped++;
      const a = parseAmount(row[col.amount], mark);
      if (!a || a.value === 0) continue;
      if (a.negative) neg++;
      else pos++;
    }
    if (untyped) {
      signSource = "inferred";
      // negatives alongside positives and no type column is a bank export (card exports are almost all one sign)
      signMode = neg > 0 && neg >= pos ? "bank" : "positive-spend";
    }
  }
  if (opts.signMode && !split) {
    signMode = opts.signMode;
    signSource = "chosen";
  }

  const parsed: Parsed[] = [];
  const skipped: Skipped[] = [];
  const baseCcy = opts.baseCurrency?.toUpperCase();
  const skip = (row: number, reason: string, detail?: string) => skipped.push({ row, reason, ...(detail ? { detail: detail.slice(0, 60) } : {}) });
  const text = (v: Cell, max: number, r: number): string | null => {
    const f = fit(clean(v), max);
    if (f.truncated) warnings.add("truncated", "Text longer than the limit was shortened", r);
    return f.value;
  };

  for (const { r, row } of data) {
    const rowNo = r + 1;
    const rawDate = row[col.date];
    const date = parseDate(rawDate, ctx);

    if (col.date >= 0 && !date) {
      // repeated header row, summary line, or junk
      const cells = row.map(str).filter(Boolean);
      if (cells.length >= 3 && matchColumns(row).columns.date >= 0 && hasMoney(matchColumns(row).columns)) {
        skip(rowNo, "repeated header row");
        continue;
      }
      if (cells.some((c) => SUMMARY_ROW.test(c))) {
        skip(rowNo, "summary row (total or balance)");
        continue;
      }
      const hasAmount = moneyCells(row).some((c) => parseAmount(c, mark));
      if (hasAmount || (col.category >= 0 && str(row[col.category]))) skip(rowNo, str(rawDate) ? "invalid date" : "missing date", str(rawDate));
      continue;
    }

    // money
    let amt: Amt;
    let flow: "in" | "out" | null = null;
    if (!split) {
      const raw = row[col.amount];
      const a = parseAmount(raw, mark);
      if (!a) {
        skip(rowNo, blank(raw) ? "missing amount" : "amount isn't a number", str(raw));
        continue;
      }
      amt = a;
    } else {
      const d = col.debit >= 0 ? row[col.debit] : null;
      const c = col.credit >= 0 ? row[col.credit] : null;
      const pd = blank(d) ? null : parseAmount(d, mark);
      const pc = blank(c) ? null : parseAmount(c, mark);
      if ((!blank(d) && !pd) || (!blank(c) && !pc)) {
        skip(rowNo, "amount isn't a number", str(blank(d) ? c : d));
        continue;
      }
      if (!pd && !pc) {
        skip(rowNo, "missing amount");
        continue;
      }
      const net = (pc?.value ?? 0) - (pd?.value ?? 0);
      flow = net > 0 ? "in" : "out";
      amt = { value: Math.abs(net), negative: false, side: null };
    }
    if (amt.value === 0) {
      skip(rowNo, "amount is zero");
      continue;
    }
    const amount = round2(amt.value);
    if (amount <= 0) {
      skip(rowNo, "amount rounds to zero", String(amt.value));
      continue;
    }

    // type
    const typeCell = col.type >= 0 ? row[col.type] : null;
    const mt = mapType(typeCell);
    if (mt === "transfer") {
      skip(rowNo, "transfer (not tracked)", str(typeCell));
      continue;
    }
    let type: ImportTxn["type"];
    if (split) type = mt === "refund" ? "refund" : flow === "in" ? "income" : "expense";
    else if (mt === "income" || mt === "refund" || mt === "expense") {
      type = mt;
      if (mt === "expense" && amt.negative && normHeader(typeCell) === "expense") type = "refund"; // a negative Expense row is a refund
    } else {
      if (mt === "unknown") warnings.add("unknown-type", "Type not recognised; read from the sign of the amount", rowNo);
      if (amt.side) type = amt.side === "cr" ? "income" : "expense";
      else if (signMode === "bank") type = amt.negative ? "expense" : "income";
      else type = amt.negative ? "refund" : "expense";
    }

    const rawCategory = col.category >= 0 ? text(row[col.category], LIMITS.category, rowNo) : null;
    const category = rawCategory || (type === "income" ? UNCATEGORIZED_INCOME : UNCATEGORIZED);
    const ccyRaw = col.currency >= 0 ? str(row[col.currency]) : "";
    const currency = /^[A-Za-z]{3}$/.test(ccyRaw) ? ccyRaw.toUpperCase() : undefined;
    if (currency && baseCcy && currency !== baseCcy) warnings.add("other-currency", `Rows in a currency other than ${baseCcy} are counted at face value (no conversion on import)`, rowNo);

    const description = col.description >= 0 ? fit(str(row[col.description]) || null, LIMITS.description) : { value: null, truncated: false };
    if (description.truncated) warnings.add("truncated", "Text longer than the limit was shortened", rowNo);
    const notes = col.notes >= 0 ? fit(str(row[col.notes]) || null, LIMITS.notes) : { value: null, truncated: false };
    if (notes.truncated) warnings.add("truncated", "Text longer than the limit was shortened", rowNo);

    parsed.push({
      ref: `r${rowNo}`,
      row: rowNo,
      date: date as string,
      type,
      category,
      subcategory: col.subcategory >= 0 ? text(row[col.subcategory], LIMITS.subcategory, rowNo) : null,
      merchant: col.merchant >= 0 ? text(row[col.merchant], LIMITS.merchant, rowNo) : null,
      description: description.value,
      amount,
      currency,
      payment: col.payment >= 0 ? text(row[col.payment], LIMITS.payment, rowNo) : null,
      paid_by: col.paidBy >= 0 ? text(row[col.paidBy], LIMITS.person, rowNo) : null,
      trip: col.trip >= 0 ? text(row[col.trip], LIMITS.trip, rowNo) : null,
      receipt_file: col.receipt >= 0 ? clean(row[col.receipt]) : null,
      notes: notes.value,
      emi: col.emi >= 0 && ["yes", "y", "true", "1"].includes(str(row[col.emi]).toLowerCase()),
      planKind: col.planKind >= 0 && str(row[col.planKind]).toLowerCase() === "spread" ? "spread" : "emi",
    });
  }

  if (dateScan.state === "mixed" && !opts.dateOrder) warnings.add("mixed-date-order", "Dates use both day-first and month-first order; rows that don't fit the chosen order are skipped");

  const samples: Detected["dateOrder"]["samples"] = [];
  for (const { row } of data) {
    const v = row[col.date];
    if (typeof v === "string" && /[/.\-]/.test(v) && samples.length < 3 && !samples.some((s) => s.raw === str(v))) samples.push({ raw: str(v), iso: parseDate(v, ctx) });
  }

  const detected: Detected = {
    headerRow: hdr.row + 1,
    headers: (rows[hdr.row] ?? []).map(str),
    columns: col,
    amountStyle: split ? "split" : "single",
    dateOrder: { value: order, state: opts.dateOrder ? "chosen" : dateScan.state, samples },
    decimalMark: { value: mark, state: opts.decimalMark ? "chosen" : decScan.state },
    signMode: { value: signMode, source: signSource },
  };
  const needsInput: ("dateOrder" | "decimalMark")[] = [];
  if (dateScan.state === "ambiguous" && !opts.dateOrder) needsInput.push("dateOrder");
  if (decScan.state === "conflict" && !opts.decimalMark) needsInput.push("decimalMark");

  return { parsed, skipped, warnings: warnings.list(), detected, needsInput };
}

export type ImportReport = {
  bundle: ImportBundle;
  detected: Detected;
  warnings: ImportWarning[];
  /** Settings that must be chosen before importing (the file can be read two ways). */
  needsInput: ("dateOrder" | "decimalMark")[];
  stats: {
    rows: number;
    transactions: number;
    plans: number;
    installmentRows: number;
    categories: number;
    trips: number;
    receipts: number;
    /** Rows left out because they match transactions already in the account. */
    duplicates: number;
    /** Rows identical to another row in the same file (kept: two coffees on one day are normal). */
    repeated: number;
    skipped: Skipped[];
    totals: { expense: number; income: number; refund: number };
  };
};

/**
 * Build the import bundle. Installment rows (EMI = Yes) are grouped into one parent transaction
 * (sum of rows, first date) + an EMI plan whose installments keep each row's actual date/amount.
 */
export function buildBundle(
  sheets: { settings?: Rows; expenses: Rows; date1904?: boolean },
  opts: ParseOptions & { tripMode?: ImportTrip["include_mode"]; replaceDefaults?: boolean; skipRefs?: Iterable<string> } = {},
): ImportReport {
  const settings = sheets.settings ? parseSettings(sheets.settings) : null;
  const res = parseExpenses(sheets.expenses, { ...opts, date1904: opts.date1904 ?? sheets.date1904 });
  const { skipped, detected, needsInput } = res;
  const warnings = res.warnings;
  let parsed = res.parsed;

  // fold differently-cased spellings of the same name into one (Settings spellings win)
  const canCat = canonicalizer(settings?.categories.map((c) => c.name));
  const canPay = canonicalizer(settings?.payment_methods);
  const canPerson = canonicalizer(settings?.people);
  const canTrip = canonicalizer(settings?.trips.map((t) => t.name));
  const canMerchant = canonicalizer();
  const canSub = new Map<string, (v: string | null) => string | null>();
  parsed = parsed.map((p) => {
    const category = canCat(p.category) as string;
    const subKey = normKey(category);
    if (!canSub.has(subKey)) canSub.set(subKey, canonicalizer(settings?.categories.find((c) => normKey(c.name) === subKey)?.subcategories));
    return {
      ...p,
      category,
      subcategory: canSub.get(subKey)!(p.subcategory),
      merchant: canMerchant(p.merchant),
      payment: canPay(p.payment),
      paid_by: canPerson(p.paid_by),
      trip: canTrip(p.trip),
    };
  });

  const plain = parsed.filter((p) => !p.emi || p.type !== "expense");
  const emiRows = parsed.filter((p) => p.emi && p.type === "expense");

  const groups = new Map<string, typeof emiRows>();
  for (const r of emiRows) {
    const k = planKey(r.description ?? "", r.merchant);
    const g = groups.get(k) ?? [];
    g.push(r);
    groups.set(k, g);
  }

  const skipRefs = new Set(opts.skipRefs ?? []);
  const strip = ({ emi: _e, row: _r, planKind: _k, ...t }: Parsed): ImportTxn => t;
  const transactions: ImportTxn[] = [];
  const plans: ImportPlan[] = [];
  const kept: Parsed[] = [];
  let duplicates = 0;
  for (const p of plain) {
    if (skipRefs.has(p.ref)) duplicates++;
    else {
      transactions.push(strip(p));
      kept.push(p);
    }
  }
  for (const [, g] of groups) {
    g.sort((a, b) => a.date.localeCompare(b.date) || a.row - b.row);
    const first = g[0];
    const ref = `plan-${first.ref}`;
    if (skipRefs.has(ref)) {
      duplicates++;
      continue;
    }
    kept.push(...g);
    transactions.push({
      ...strip(first),
      ref,
      description: fit(planBaseName(first.description ?? "") || first.description, LIMITS.description).value,
      amount: round2(g.reduce((a, r) => a + r.amount, 0)),
    });
    plans.push({
      ref,
      kind: first.planKind,
      months: g.length,
      start_month: `${first.date.slice(0, 7)}-01`,
      installments: g.map((r, i) => ({ seq: i + 1, due_date: r.date, amount: r.amount })),
    });
  }
  transactions.sort((a, b) => a.date.localeCompare(b.date));

  // categories: settings first, then anything only seen in rows
  const catMap = new Map<string, Omit<ImportCategory, "color">>();
  for (const c of settings?.categories ?? []) catMap.set(c.name, { ...c, subcategories: [...c.subcategories] });
  for (const t of transactions) {
    let c = catMap.get(t.category);
    if (!c) {
      c = { name: t.category, kind: t.type === "income" ? "income" : "expense", is_core: !NON_CORE.has(t.category.toLowerCase()), budget: 0, description: null, subcategories: [], sort_order: catMap.size + 1 };
      catMap.set(t.category, c);
    }
    if (t.subcategory && !c.subcategories.includes(t.subcategory)) c.subcategories.push(t.subcategory);
  }

  // colors follow the entity: palette slots by total spend (assigned once, at import)
  const spend = new Map<string, number>();
  for (const t of kept) if (t.type === "expense") spend.set(t.category, (spend.get(t.category) ?? 0) + t.amount);
  const ranked = [...catMap.values()].filter((c) => c.kind === "expense").sort((a, b) => (spend.get(b.name) ?? 0) - (spend.get(a.name) ?? 0));
  const slot = new Map(ranked.slice(0, 8).map((c, i) => [c.name, `c${i + 1}`]));
  const categories: ImportCategory[] = [...catMap.values()].map((c) => ({ ...c, color: slot.get(c.name) ?? null }));

  // trips with dates derived from tagged rows when not set
  const tripNames = new Set([...(settings?.trips ?? []).map((t) => t.name), ...kept.map((t) => t.trip).filter(Boolean) as string[]]);
  const trips: ImportTrip[] = [...tripNames].map((name) => {
    const s = settings?.trips.find((t) => t.name === name);
    const dates = kept.filter((t) => t.trip === name).map((t) => t.date).sort();
    let start = s?.start ?? dates[0] ?? null;
    let end = s?.end ?? dates.at(-1) ?? null;
    if (start && end && end < start) {
      [start, end] = [end, start];
      warnings.push({ kind: "trip-dates", message: `Trip "${name}" ended before it started; the dates were swapped`, rows: [] });
    }
    return { name, start_date: start, end_date: end, include_mode: opts.tripMode ?? "itemized" };
  });

  const earliest = transactions[0]?.date ?? new Date().toISOString().slice(0, 10);
  const budgetMonth = `${(settings?.trackingStart ?? earliest).slice(0, 7)}-01`;

  const bundle: ImportBundle = {
    replace_defaults: opts.replaceDefaults ?? Boolean(settings),
    budget_month: budgetMonth < `${earliest.slice(0, 7)}-01` ? budgetMonth : `${earliest.slice(0, 7)}-01`,
    categories,
    payment_methods: [...new Set([...(settings?.payment_methods ?? []), ...transactions.map((t) => t.payment).filter(Boolean) as string[]])].filter(
      (p) => !["unknown", "n/a", "-", "none"].includes(p.toLowerCase()),
    ),
    people: [...new Set([...(settings?.people ?? []), ...transactions.map((t) => t.paid_by).filter(Boolean) as string[]])],
    trips,
    transactions,
    plans,
  };

  const totals = { expense: 0, income: 0, refund: 0 };
  for (const t of kept) totals[t.type] = round2(totals[t.type] + t.amount);

  const seen = new Map<string, number>();
  let repeated = 0;
  for (const t of transactions) {
    const k = `${t.date}|${t.amount}|${normKey(t.merchant ?? "")}|${normKey(t.description ?? "")}|${t.type}`;
    const n = seen.get(k) ?? 0;
    if (n) repeated++;
    seen.set(k, n + 1);
  }

  return {
    bundle,
    detected,
    warnings,
    needsInput,
    stats: {
      rows: kept.length,
      transactions: transactions.length,
      plans: plans.length,
      installmentRows: kept.filter((p) => p.emi && p.type === "expense").length,
      categories: categories.length,
      trips: trips.length,
      receipts: new Set(kept.map((t) => t.receipt_file).filter(Boolean)).size,
      duplicates,
      repeated,
      skipped,
      totals,
    },
  };
}
