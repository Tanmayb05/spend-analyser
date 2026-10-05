// All app dates are ISO strings "YYYY-MM-DD" (no timezone drift). Months are "YYYY-MM-01".

export type ISODate = string;

export function toISO(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISO(s: ISODate): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Today in a given IANA timezone. */
export function todayIn(timeZone = "UTC"): ISODate {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return toISO(new Date());
  }
}

export function monthStart(s: ISODate): ISODate {
  return `${s.slice(0, 7)}-01`;
}

export function addMonths(month: ISODate, n: number): ISODate {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}-01`;
}

export function monthEnd(month: ISODate): ISODate {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${month.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

export function daysInMonth(month: ISODate): number {
  return Number(monthEnd(month).slice(8, 10));
}

/** Months from `from` to `to` inclusive (both month starts). */
export function monthRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let m = monthStart(from); m <= monthStart(to); m = addMonths(m, 1)) out.push(m);
  return out;
}

export function isValidMonthParam(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function formatMonth(month: ISODate, style: "long" | "short" = "long"): string {
  const d = parseISO(month);
  return d.toLocaleDateString("en-US", style === "long" ? { month: "long", year: "numeric" } : { month: "short" });
}

export function formatDay(s: ISODate): string {
  return parseISO(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function relativeDays(target: ISODate, today: ISODate): string {
  const diff = Math.round((parseISO(target).getTime() - parseISO(today).getTime()) / 86_400_000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}
