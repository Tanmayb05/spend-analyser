// Cell-level parsers for the importer: text, dates, amounts, transaction types.
// Pure and explicit: anything locale-dependent (date order, decimal mark) is passed in, never guessed
// inside a parser. The scan* functions look at a whole column to infer those settings.

export type Cell = string | number | boolean | Date | null | undefined;

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Longest values the database accepts (see the schema's check constraints). */
export const LIMITS = {
  description: 500,
  notes: 2000,
  category: 60,
  subcategory: 60,
  payment: 60,
  person: 60,
  merchant: 120,
  trip: 80,
} as const;

const UNKNOWN = new Set(["", "unknown", "n/a", "na", "-", "none", "null", "nil"]);

/** NFC-normalise, swap exotic spaces for a plain one, drop zero-width and control characters, collapse runs. */
export function normText(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[​-‍⁠﻿]/g, "")
    .replace(/[   -   　]/g, " ")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function str(v: Cell): string {
  if (v == null) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString();
  return normText(String(v));
}

/** Like str() but "n/a", "-", "none" and friends become null. */
export function clean(v: Cell): string | null {
  const s = str(v);
  return UNKNOWN.has(s.toLowerCase()) ? null : s;
}

/** Case/width/accent-insensitive key for matching names. */
export function normKey(s: string): string {
  return normText(s).normalize("NFKC").toLowerCase();
}

/** Header key: lowercase letters and digits separated by single spaces ("Dr/Cr" → "dr cr"). */
export function normHeader(v: Cell): string {
  return str(v).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Cut to the database limit without splitting a surrogate pair. */
export function fit(s: string | null, max: number): { value: string | null; truncated: boolean } {
  if (s == null || s.length <= max) return { value: s, truncated: false };
  let cut = s.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return { value: cut.trimEnd(), truncated: true };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export type DateOrder = "dmy" | "mdy";

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const MIN_YEAR = 1970;
const MAX_YEAR = 2100;

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");

function ymd(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1 || d > daysIn(y, m)) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function fullYear(raw: string): number {
  if (raw.length === 4) return Number(raw);
  const yy = Number(raw);
  return yy <= (new Date().getFullYear() % 100) + 1 ? 2000 + yy : 1900 + yy;
}

function serialToIso(n: number, date1904: boolean): string | null {
  const days = Math.floor(n + 1e-9) - (date1904 ? -1462 : 0);
  const d = new Date(Math.round((days - 25569) * 86_400_000));
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

const NUMERIC_DATE = /^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})(?:[ T,].*)?$/;
const DMY_TEXT = /^(\d{1,2})(?:st|nd|rd|th)?[ \-/.]+([A-Za-z]{3,9})\.?,?[ \-/.]+(\d{2,4})(?:[ T,].*)?$/;
const MDY_TEXT = /^([A-Za-z]{3,9})\.?[ \-/.]+(\d{1,2})(?:st|nd|rd|th)?,?[ \-/.]+(\d{2,4})(?:[ T,].*)?$/;
const YMD_TEXT = /^(\d{4})[ \-/.]+([A-Za-z]{3,9})\.?[ \-/.]+(\d{1,2})(?:[ T,].*)?$/;

export type DateCtx = { order: DateOrder; date1904?: boolean };

/** Any recognised date → YYYY-MM-DD, or null if it isn't a real calendar date. */
export function parseDate(v: Cell, ctx: DateCtx): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : ymd(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    if (Number.isInteger(v) && v >= 19000101 && v <= 21001231) return ymd(Math.floor(v / 10000), Math.floor((v % 10000) / 100), v % 100);
    return serialToIso(v, ctx.date1904 ?? false);
  }
  const s = str(v);
  if (!s) return null;
  if (/^\d{8}$/.test(s)) return ymd(Number(s.slice(0, 4)), Number(s.slice(4, 6)), Number(s.slice(6, 8)));
  if (/^\d{5}(\.\d+)?$/.test(s)) return serialToIso(Number(s), ctx.date1904 ?? false);

  let m = s.match(NUMERIC_DATE);
  if (m) {
    const [, a, b, c] = m;
    if (a.length === 4) return ymd(Number(a), Number(b), Number(c)); // ISO-like: Y-M-D
    if (c.length === 4 || c.length === 2) {
      const [day, month] = ctx.order === "dmy" ? [Number(a), Number(b)] : [Number(b), Number(a)];
      return ymd(fullYear(c), month, day);
    }
    return null;
  }
  m = s.match(DMY_TEXT);
  if (m && MONTHS[m[2].toLowerCase()]) return ymd(fullYear(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]));
  m = s.match(MDY_TEXT);
  if (m && MONTHS[m[1].toLowerCase()]) return ymd(fullYear(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]));
  m = s.match(YMD_TEXT);
  if (m && MONTHS[m[2].toLowerCase()]) return ymd(Number(m[1]), MONTHS[m[2].toLowerCase()], Number(m[3]));
  return null;
}

export type DateOrderScan = {
  /** known: one order fits every slash date. ambiguous: every slash date fits both. mixed: both orders are needed. none: no slash dates. */
  state: "known" | "ambiguous" | "mixed" | "none";
  order: DateOrder;
};

/** Look at every a/b/yyyy-style value in a column and work out day-first vs month-first. */
export function scanDateOrder(values: Cell[]): DateOrderScan {
  let dayFirst = 0; // first part > 12: can only be the day
  let monthFirst = 0; // second part > 12: can only be the day, so the first part is the month
  let ambiguous = 0;
  for (const v of values) {
    if (typeof v !== "string") continue;
    const m = normText(v).match(NUMERIC_DATE);
    if (!m || m[1].length === 4 || (m[3].length !== 4 && m[3].length !== 2)) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && b <= 12) dayFirst++;
    else if (b > 12 && a <= 12) monthFirst++;
    else if (a <= 12 && b <= 12 && a !== b) ambiguous++; // 03/03 reads the same either way
  }
  if (dayFirst && monthFirst) return { state: "mixed", order: dayFirst >= monthFirst ? "dmy" : "mdy" };
  if (dayFirst) return { state: "known", order: "dmy" };
  if (monthFirst) return { state: "known", order: "mdy" };
  if (ambiguous) return { state: "ambiguous", order: "mdy" };
  return { state: "none", order: "mdy" };
}

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

export type DecimalMark = "." | ",";

export type Amt = { value: number; negative: boolean; side: "dr" | "cr" | null };

const MINUS = /[−‒–—﹣－]/g;

/** Strip currency symbols and codes, signs, parentheses, Dr/Cr. Returns the bare digits-and-separators core, or null if letters remain. */
function amountCore(raw: string): { core: string; negative: boolean; side: "dr" | "cr" | null } | null {
  let s = raw.replace(MINUS, "-");
  let negative = false;
  let side: "dr" | "cr" | null = null;

  const paren = s.match(/^\((.*)\)$/);
  if (paren) {
    negative = true;
    s = paren[1].trim();
  }
  s = s.replace(/(^|[\s\d)])(dr|db|debit|cr|credit)\.?(?=$|[\s\d(-])/gi, (_m, pre: string, word: string) => {
    side = /^(dr|db|debit)$/i.test(word) ? "dr" : "cr";
    return pre;
  });
  s = s.replace(/\p{Sc}/gu, "").trim();
  s = s.replace(/^(rs|inr|usd|eur|gbp|[A-Za-z]{3})\.?\s*(?=[\d\-+.,(])/i, "").replace(/(?<=[\d)])\s*[A-Za-z]{2,3}\.?$/, "").trim();
  if (/[^\d.,\s'’+\-]/.test(s)) return null; // letters left: "1e3", "abc", "12 apples"

  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  } else if (s.startsWith("+")) s = s.slice(1);
  s = s.replace(/[\s'’]/g, "");
  if (!s || /[+-]/.test(s)) return null;
  return { core: s, negative, side };
}

/** Plain: 1234.56. Grouped: 1,234.56 and Indian 1,23,456.78. */
function amountPattern(mark: DecimalMark): RegExp {
  const g = mark === "." ? "," : "\\.";
  const d = mark === "." ? "\\." : ",";
  return new RegExp(`^(?:\\d{1,3}(?:${g}\\d{3})+|\\d{1,2}(?:${g}\\d{2})+${g}\\d{3}|\\d*)(?:${d}\\d+)?$`);
}

/** Parse a money cell with the given decimal mark. Numbers pass through; text must match the mark strictly (no guessing). */
export function parseAmount(v: Cell, mark: DecimalMark): Amt | null {
  if (typeof v === "number") return Number.isFinite(v) ? { value: Math.abs(v), negative: v < 0, side: null } : null;
  if (v instanceof Date || typeof v === "boolean") return null;
  const s = str(v);
  if (!s || s.startsWith("=")) return null;
  const c = amountCore(s);
  if (!c || !/\d/.test(c.core) || !amountPattern(mark).test(c.core)) return null;
  const n = Number(mark === "." ? c.core.replace(/,/g, "") : c.core.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return { value: Math.abs(n), negative: c.negative, side: c.side };
}

export type DecimalScan = {
  /** known: the evidence agrees. conflict: both marks appear as decimals. none: no text amounts to learn from (plain numbers). */
  state: "known" | "conflict" | "none";
  mark: DecimalMark;
};

/**
 * Work out the decimal mark from every text amount in the file.
 * "1.234,56" → comma. "12,5" → comma. "1,234.56" → point. "1,234" has a 3-digit tail, so its comma is a
 * thousands mark and the decimal mark is the point. Plain numbers and integers carry no evidence.
 */
export function scanDecimalMark(values: Cell[]): DecimalScan {
  const strong = { ".": 0, ",": 0 };
  const weak = { ".": 0, ",": 0 };
  let seen = 0;
  for (const v of values) {
    if (typeof v !== "string") continue;
    const c = amountCore(str(v));
    if (!c) continue;
    const t = c.core;
    const dots = (t.match(/\./g) ?? []).length;
    const commas = (t.match(/,/g) ?? []).length;
    if (!dots && !commas) continue;
    seen++;
    if (dots && commas) {
      strong[t.lastIndexOf(".") > t.lastIndexOf(",") ? "." : ","]++;
    } else {
      const sep = dots ? "." : ",";
      const other = dots ? "," : ".";
      const n = dots || commas;
      const tail = t.length - t.lastIndexOf(sep) - 1;
      if (n > 1) weak[other]++; // 1,234,567: repeated, so a grouping mark
      else if (tail === 3) weak[other]++; // 1,234: money has at most 2 decimals
      else if (tail >= 1 && tail <= 2) strong[sep]++; // 12,5 / 12.50
    }
  }
  if (!seen) return { state: "none", mark: "." };
  if (strong["."] && strong[","]) return { state: "conflict", mark: strong["."] >= strong[","] ? "." : "," };
  if (strong["."]) return { state: "known", mark: "." };
  if (strong[","]) return { state: "known", mark: "," };
  if (weak["."] && weak[","]) return { state: "conflict", mark: weak["."] >= weak[","] ? "." : "," };
  if (weak[","]) return { state: "known", mark: "," };
  return { state: weak["."] ? "known" : "none", mark: "." };
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------------------
// Transaction type
// ---------------------------------------------------------------------------

export type MappedType = "income" | "refund" | "expense" | "transfer" | "blank" | "unknown";

const TYPE_WORDS: Record<Exclude<MappedType, "blank" | "unknown">, string[]> = {
  income: ["income", "credit", "deposit", "salary", "inflow", "cr", "money in", "paid in", "interest", "dividend"],
  refund: ["refund", "return", "reversal", "chargeback", "cashback", "rebate"],
  expense: ["expense", "debit", "purchase", "sale", "withdrawal", "dr", "spend", "spending", "outflow", "money out", "paid out", "fee", "charge", "pos", "atm"],
  // "payment" on a card statement is the card being paid off, which would double count if imported as spending
  transfer: ["transfer", "xfer", "internal", "payment", "card payment", "autopay"],
};

export function mapType(raw: Cell): MappedType {
  const k = normHeader(raw);
  if (!k) return "blank";
  for (const [type, words] of Object.entries(TYPE_WORDS) as [keyof typeof TYPE_WORDS, string[]][]) {
    if (words.includes(k)) return type;
  }
  // bank codes like ACH_DEBIT, DEBIT_CARD, ACH_CREDIT, "Credit card payment"
  if (/\b(transfer|xfer|payment|autopay)\b/.test(k)) return "transfer";
  if (/\b(refund|return|reversal)\b/.test(k)) return "refund";
  if (/\bcredit card\b/.test(k)) return "expense";
  if (/\b(credit|deposit|salary|interest|dividend)\b/.test(k)) return "income";
  if (/\b(debit|withdrawal|purchase|sale|fee|charge|atm)\b/.test(k)) return "expense";
  return "unknown";
}

export const SUMMARY_ROW = /^(grand total|sub ?total|total|totals|opening balance|closing balance|beginning balance|ending balance|balance|balance brought forward|balance carried forward)\b/i;
