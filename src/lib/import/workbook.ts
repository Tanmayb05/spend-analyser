// Parses the Expense Tracker workbook (or any sheet with the same columns) into an import_bundle payload.
// Pure: takes SheetJS-style row arrays, no I/O, so it runs in the browser and in tests.

export type Cell = string | number | boolean | null | undefined;
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

export type ImportReport = {
  bundle: ImportBundle;
  stats: {
    rows: number;
    transactions: number;
    plans: number;
    installmentRows: number;
    categories: number;
    trips: number;
    receipts: number;
    skipped: { row: number; reason: string }[];
    totals: { expense: number; income: number; refund: number };
  };
};

/** Categories the workbook's Bucket formula treats as not "Core". */
const NON_CORE = new Set(["education", "travel", "rent & utilities", "income", "housing & utilities"]);
const UNKNOWN = new Set(["", "unknown", "n/a", "-", "none"]);

const str = (v: Cell): string => (v == null ? "" : String(v).trim());
const clean = (v: Cell): string | null => {
  const s = str(v);
  return UNKNOWN.has(s.toLowerCase()) ? null : s;
};

/** Excel serial (1900 system) or ISO-ish string → YYYY-MM-DD. */
export function toIsoDate(v: Cell): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = Math.round((v - 25569) * 86_400_000);
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  const s = str(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // M/D/YYYY
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

function toAmount(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = str(v).replace(/[^0-9.\-]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function headerIndex(row: Cell[]): Map<string, number> {
  return new Map(row.map((h, i) => [str(h).toLowerCase(), i] as const).filter(([h]) => h));
}

function pick(idx: Map<string, number>, names: string[]): number {
  for (const n of names) {
    const i = idx.get(n);
    if (i !== undefined) return i;
  }
  return -1;
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

export function parseSettings(rows: Rows): Settings {
  const out: Settings = { categories: [], trips: [], payment_methods: [], people: [], trackingStart: null };
  const hRow = rows.findIndex((r) => r.some((c) => str(c) === "Category") && r.some((c) => str(c).startsWith("Monthly Budget")));
  if (hRow < 0) return out;
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

  let catDone = false;
  let tripsDone = false;
  for (let r = hRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const name = str(row[cName]);
    if (!catDone) {
      if (!name || name === "GENERAL") catDone = true;
      else
        out.categories.push({
          name,
          kind: str(row[cType]).toLowerCase() === "income" ? "income" : "expense",
          is_core: !NON_CORE.has(name.toLowerCase()),
          budget: toAmount(row[cBudget]) ?? 0,
          description: str(row[cDesc]) || null,
          subcategories: str(row[cSubs]).split(",").map((s) => s.trim()).filter(Boolean),
          sort_order: out.categories.length + 1,
        });
    }
    if (cTrip >= 0 && str(row[cTrip]) === "GENERAL") tripsDone = true;
    if (!tripsDone && cTrip >= 0 && str(row[cTrip])) out.trips.push({ name: str(row[cTrip]), start: toIsoDate(row[cStart]), end: toIsoDate(row[cEnd]) });
    if (cPay >= 0 && str(row[cPay])) out.payment_methods.push(str(row[cPay]));
    if (cPerson >= 0 && str(row[cPerson])) out.people.push(str(row[cPerson]));
    const ts = row.findIndex((c) => str(c) === "Tracking starts");
    if (ts >= 0) out.trackingStart = toIsoDate(row[ts + 1]);
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

export function parseExpenses(rows: Rows) {
  const hRow = rows.findIndex((r) => {
    const s = r.map((c) => str(c).toLowerCase());
    return s.includes("date") && s.includes("amount");
  });
  if (hRow < 0) throw new Error("Couldn't find a header row with Date and Amount columns.");
  const idx = headerIndex(rows[hRow]);
  const col = {
    date: pick(idx, ["date"]),
    type: pick(idx, ["type"]),
    category: pick(idx, ["category"]),
    subcategory: pick(idx, ["subcategory", "sub-category", "sub category"]),
    merchant: pick(idx, ["merchant", "payee", "vendor"]),
    description: pick(idx, ["description", "details", "memo"]),
    amount: pick(idx, ["amount", "value"]),
    currency: pick(idx, ["currency"]),
    payment: pick(idx, ["payment", "payment method", "account"]),
    paidBy: pick(idx, ["paid by", "paid_by"]),
    trip: pick(idx, ["trip", "event"]),
    emi: pick(idx, ["emi", "installment"]),
    receipt: pick(idx, ["receipt"]),
    notes: pick(idx, ["notes"]),
    planKind: pick(idx, ["plan kind"]),
  };

  type Parsed = ImportTxn & { emi: boolean; row: number; planKind: "spread" | "emi" };
  const parsed: Parsed[] = [];
  const skipped: { row: number; reason: string }[] = [];

  for (let r = hRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (row.every((c) => str(c) === "")) continue;
    const date = toIsoDate(row[col.date]);
    const rawAmount = toAmount(row[col.amount]);
    const category = str(row[col.category]);
    if (!date) {
      if (rawAmount != null || category) skipped.push({ row: r + 1, reason: "missing or invalid date" });
      continue;
    }
    if (rawAmount == null || rawAmount === 0) {
      skipped.push({ row: r + 1, reason: "missing amount" });
      continue;
    }
    if (!category) {
      skipped.push({ row: r + 1, reason: "missing category" });
      continue;
    }
    const typeRaw = str(row[col.type]).toLowerCase();
    let type: ImportTxn["type"] = typeRaw === "income" ? "income" : typeRaw === "refund" ? "refund" : "expense";
    let amount = rawAmount;
    if (amount < 0) {
      // negative amounts in generic CSVs: expense refund
      amount = -amount;
      if (type === "expense") type = "refund";
    }
    parsed.push({
      ref: `r${r + 1}`,
      row: r + 1,
      date,
      type,
      category,
      subcategory: clean(row[col.subcategory]),
      merchant: clean(row[col.merchant]),
      description: str(row[col.description]) || null,
      amount: round2(amount),
      currency: col.currency >= 0 && /^[A-Za-z]{3}$/.test(str(row[col.currency])) ? str(row[col.currency]).toUpperCase() : undefined,
      payment: clean(row[col.payment]),
      paid_by: clean(row[col.paidBy]),
      trip: clean(row[col.trip]),
      receipt_file: clean(row[col.receipt]),
      notes: col.notes >= 0 ? str(row[col.notes]) || null : null,
      emi: ["yes", "y", "true", "1"].includes(str(row[col.emi]).toLowerCase()),
      planKind: str(row[col.planKind]).toLowerCase() === "spread" ? "spread" : "emi",
    });
  }
  return { parsed, skipped };
}

/**
 * Build the import bundle. Installment rows (EMI = Yes) are grouped into one parent transaction
 * (sum of rows, first date) + an EMI plan whose installments keep each row's actual date/amount.
 */
export function buildBundle(
  sheets: { settings?: Rows; expenses: Rows },
  opts: { tripMode?: ImportTrip["include_mode"]; replaceDefaults?: boolean } = {},
): ImportReport {
  const settings = sheets.settings ? parseSettings(sheets.settings) : null;
  const { parsed, skipped } = parseExpenses(sheets.expenses);

  const plain = parsed.filter((p) => !p.emi || p.type !== "expense");
  const emiRows = parsed.filter((p) => p.emi && p.type === "expense");

  const groups = new Map<string, typeof emiRows>();
  for (const r of emiRows) {
    const k = planKey(r.description ?? "", r.merchant);
    const g = groups.get(k) ?? [];
    g.push(r);
    groups.set(k, g);
  }

  const strip = ({ emi: _e, row: _r, planKind: _k, ...t }: (typeof parsed)[number]): ImportTxn => t;
  const transactions: ImportTxn[] = plain.map(strip);
  const plans: ImportPlan[] = [];
  for (const [, g] of groups) {
    g.sort((a, b) => a.date.localeCompare(b.date) || a.row - b.row);
    const first = g[0];
    const ref = `plan-${first.ref}`;
    transactions.push({
      ...strip(first),
      ref,
      description: planBaseName(first.description ?? "") || first.description,
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
  for (const t of parsed) if (t.type === "expense") spend.set(t.category, (spend.get(t.category) ?? 0) + t.amount);
  const ranked = [...catMap.values()].filter((c) => c.kind === "expense").sort((a, b) => (spend.get(b.name) ?? 0) - (spend.get(a.name) ?? 0));
  const slot = new Map(ranked.slice(0, 8).map((c, i) => [c.name, `c${i + 1}`]));
  const categories: ImportCategory[] = [...catMap.values()].map((c) => ({ ...c, color: slot.get(c.name) ?? null }));

  // trips with dates derived from tagged rows when not set
  const tripNames = new Set([...(settings?.trips ?? []).map((t) => t.name), ...parsed.map((t) => t.trip).filter(Boolean) as string[]]);
  const trips: ImportTrip[] = [...tripNames].map((name) => {
    const s = settings?.trips.find((t) => t.name === name);
    const dates = parsed.filter((t) => t.trip === name).map((t) => t.date).sort();
    return { name, start_date: s?.start ?? dates[0] ?? null, end_date: s?.end ?? dates.at(-1) ?? null, include_mode: opts.tripMode ?? "itemized" };
  });

  const earliest = transactions[0]?.date ?? new Date().toISOString().slice(0, 10);
  const budgetMonth = `${(settings?.trackingStart ?? earliest).slice(0, 7)}-01`;

  const bundle: ImportBundle = {
    replace_defaults: opts.replaceDefaults ?? Boolean(settings),
    budget_month: budgetMonth < `${earliest.slice(0, 7)}-01` ? budgetMonth : `${earliest.slice(0, 7)}-01`,
    categories,
    payment_methods: [...new Set([...(settings?.payment_methods ?? []), ...transactions.map((t) => t.payment).filter(Boolean) as string[]])].filter(
      (p) => !UNKNOWN.has(p.toLowerCase()),
    ),
    people: [...new Set([...(settings?.people ?? []), ...transactions.map((t) => t.paid_by).filter(Boolean) as string[]])],
    trips,
    transactions,
    plans,
  };

  const totals = { expense: 0, income: 0, refund: 0 };
  for (const t of parsed) totals[t.type] = round2(totals[t.type] + t.amount);

  return {
    bundle,
    stats: {
      rows: parsed.length,
      transactions: transactions.length,
      plans: plans.length,
      installmentRows: emiRows.length,
      categories: categories.length,
      trips: trips.length,
      receipts: new Set(parsed.map((t) => t.receipt_file).filter(Boolean)).size,
      skipped,
      totals,
    },
  };
}
