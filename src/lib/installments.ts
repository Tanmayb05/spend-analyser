// Mirrors public.regen_installments() so the form can preview exactly what the database will store.
import { addMonths, daysInMonth, type ISODate } from "./dates";
import { round2 } from "./utils";

export type ScheduleRow = { seq: number; due: ISODate; amount: number };

export function buildSchedule(opts: {
  total: number;
  months: number;
  startMonth: ISODate; // YYYY-MM-01
  dayOfMonth: number;
  installmentAmount?: number | null;
}): ScheduleRow[] {
  const { total, months, startMonth, dayOfMonth } = opts;
  if (!(total > 0) || !Number.isInteger(months) || months < 1) return [];
  const per = opts.installmentAmount && opts.installmentAmount > 0 ? round2(opts.installmentAmount) : round2(total / months);
  if (months > 1 && per * (months - 1) >= total) return [];

  return Array.from({ length: months }, (_, i) => {
    const m = addMonths(startMonth, i);
    const day = Math.min(dayOfMonth, daysInMonth(m));
    return {
      seq: i + 1,
      due: `${m.slice(0, 8)}${String(day).padStart(2, "0")}`,
      amount: i < months - 1 ? per : round2(total - per * (months - 1)),
    };
  });
}

/** Months needed to pay `total` at `perMonth`. */
export function monthsForAmount(total: number, perMonth: number): number {
  if (!(total > 0) || !(perMonth > 0)) return 0;
  return Math.ceil(round2(total / perMonth) - 1e-9);
}
