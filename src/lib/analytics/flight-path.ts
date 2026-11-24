/**
 * Shaping for the forecast "flight path": the month as a route from day 1 to the last day, with an even-pace
 * reference line and today's position against it. Pure, no I/O.
 */

export type PaceBasis = "budget" | "last-month";
export type GapTone = "good" | "warn" | "bad" | "neutral";

export type FlightInput = {
  /** today's day of the month (1-based) and the month's length */
  day: number;
  days: number;
  /** running posted spend by day, index 0 = day 1, through today */
  cumulative: number[];
  /** the monthly budget, 0 when none is set */
  budget: number;
  /** last month's total, 0 when there is none */
  lastMonthTotal: number;
  /** projected month end; only drawn once there is a day left to project into */
  projected: number;
  /** top of the likely range; keeps it inside the chart. Defaults to projected */
  high?: number;
  early: boolean;
};

export type FlightPath = {
  basis: PaceBasis | null;
  /** where an even pace ends on the last day; 0 without a basis */
  target: number;
  /** actual spend so far */
  actual: number;
  /** the even-pace amount for today */
  expectedToday: number;
  /** actual minus expected: negative = under pace (good), positive = over */
  gap: number;
  tone: GapTone;
  /** top of the chart's value axis, with headroom */
  top: number;
  /** whether to draw the dashed projection from today to the month end */
  showProjection: boolean;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/** The amount an even pace has reached by `day`: a straight line from nothing to `target` over the month. */
export function expectedAt(target: number, day: number, days: number): number {
  if (target <= 0 || days <= 0) return 0;
  return (target * clamp(day, 0, days)) / days;
}

/** Whole-currency difference counts as on pace when it rounds to zero. */
const SAME = 0.5;

export function toneFor(gap: number, target: number): GapTone {
  if (Math.abs(gap) < SAME) return "neutral";
  if (gap < 0) return "good";
  return gap <= target * 0.1 ? "warn" : "bad";
}

export function flightPath(i: FlightInput): FlightPath {
  const basis: PaceBasis | null = i.budget > 0 ? "budget" : i.lastMonthTotal > 0 ? "last-month" : null;
  const target = basis === "budget" ? i.budget : basis === "last-month" ? i.lastMonthTotal : 0;
  const actual = i.cumulative.at(-1) ?? 0;
  const expectedToday = expectedAt(target, i.day, i.days);
  const gap = basis ? Math.round((actual - expectedToday) * 100) / 100 : 0;
  const showProjection = !i.early && i.day < i.days;
  const peak = Math.max(target, actual, showProjection ? Math.max(i.projected, i.high ?? 0) : 0, ...i.cumulative, 1);
  return { basis, target, actual, expectedToday, gap, tone: basis ? toneFor(gap, target) : "neutral", top: peak * 1.08, showProjection };
}

/** "$120 under pace", "$45 over pace" or "On pace". `money` formats an amount (already rounded for display). */
export function gapPhrase(gap: number, money: (n: number) => string): string {
  if (Math.abs(gap) < SAME) return "On pace";
  return `${money(Math.abs(gap))} ${gap < 0 ? "under" : "over"} pace`;
}

/** What the dashed line stands for, in plain words. */
export function paceNote(basis: PaceBasis, target: number, money: (n: number) => string): string {
  return basis === "budget" ? `Even pace to your ${money(target)} budget` : `Even pace to last month's ${money(target)}`;
}
