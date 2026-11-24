/**
 * Shaping for the dashboard year heatmap: daily spend, intensity levels and the week-by-weekday grid. Pure, no I/O.
 * Dates are ISO "YYYY-MM-DD"; all day arithmetic is done in UTC so daylight saving never shifts a day.
 */
import type { LedgerRow } from "@/lib/data/types";
import { round2 } from "@/lib/utils";

export const HEAT_LEVELS = 4;

const DAY_MS = 86_400_000;
const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(date: string, n: number): string {
  return iso(utc(date) + n * DAY_MS);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekdayOf(date: string): number {
  return new Date(utc(date)).getUTCDay();
}

/** Net spend per day for posted rows: expenses minus refunds, income and scheduled (future) rows left out. */
export function dailySpend(rows: LedgerRow[], from: string, to: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.is_scheduled || r.type === "income") continue;
    if (r.entry_date < from || r.entry_date > to) continue;
    m.set(r.entry_date, round2((m.get(r.entry_date) ?? 0) + Number(r.spend)));
  }
  return m;
}

/** Cut points (quartiles of the days that had spending) between levels 1..HEAT_LEVELS. Empty when nothing was spent. */
export function heatThresholds(amounts: Iterable<number>): number[] {
  const pos = [...amounts].filter((a) => a > 0).sort((a, b) => a - b);
  if (!pos.length) return [];
  return Array.from({ length: HEAT_LEVELS - 1 }, (_, i) => pos[Math.floor(((i + 1) / HEAT_LEVELS) * (pos.length - 1))]);
}

/** 0 for a day without spending, otherwise 1..HEAT_LEVELS (more of the cut points passed = darker). */
export function heatLevel(amount: number, thresholds: number[]): number {
  if (!(amount > 0)) return 0;
  return 1 + thresholds.filter((t) => amount > t).length;
}

export type HeatCell = { date: string; amount: number; level: number };
export type HeatGrid = {
  /** columns; each has 7 slots from the first weekday, null where the day falls outside from..to */
  weeks: (HeatCell | null)[][];
  /** short month names with the column they start in */
  months: { col: number; label: string; year: number }[];
  /** weekday (0 = Sunday) of each row, top to bottom */
  rowDays: number[];
  total: number;
  activeDays: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** least columns between two month labels, so neighbouring names never overlap */
const MIN_LABEL_GAP = 3;

/**
 * The last `weeks` weeks ending on `end` (default one year): columns are weeks starting on `weekStart`, rows the 7 weekdays.
 * Days before the window or after `end` are null so the grid keeps its shape.
 */
export function buildHeatGrid(spend: Map<string, number>, end: string, weekStart: number, weeks = 53): HeatGrid {
  const endCol = (weekdayOf(end) - weekStart + 7) % 7; // where `end` sits in its column
  const firstColStart = addDays(end, -endCol - (weeks - 1) * 7);
  const from = firstColStart;
  const thresholds = heatThresholds([...spend].filter(([d]) => d >= from && d <= end).map(([, v]) => v));
  let total = 0;
  let activeDays = 0;
  const cols: (HeatCell | null)[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: (HeatCell | null)[] = [];
    for (let r = 0; r < 7; r++) {
      const date = addDays(firstColStart, w * 7 + r);
      if (date > end || date < from) {
        col.push(null);
        continue;
      }
      const amount = Math.max(spend.get(date) ?? 0, 0);
      if (amount > 0) {
        total += amount;
        activeDays++;
      }
      col.push({ date, amount, level: heatLevel(amount, thresholds) });
    }
    cols.push(col);
  }
  const months: HeatGrid["months"] = [];
  let seen = "";
  for (let c = 0; c < cols.length; c++) {
    const first = cols[c].find((x) => x);
    if (!first) continue;
    // a month is named at the column holding its first visible day, once
    const day1 = cols[c].find((x) => x?.date.endsWith("-01"));
    const key = day1 ? day1.date.slice(0, 7) : c === 0 ? first.date.slice(0, 7) : "";
    if (!key || key === seen) continue;
    const last = months.at(-1);
    if (last && c - last.col < MIN_LABEL_GAP) continue;
    seen = key;
    months.push({ col: c, label: MONTHS[Number(key.slice(5, 7)) - 1], year: Number(key.slice(0, 4)) });
  }
  return { weeks: cols, months, rowDays: Array.from({ length: 7 }, (_, r) => (weekStart + r) % 7), total: round2(total), activeDays };
}
