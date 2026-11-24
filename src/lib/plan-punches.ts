import type { ISODate } from "@/lib/dates";

export type PunchState = "paid" | "next" | "upcoming";
export type Punch = { seq: number; due: ISODate; amount: number; state: PunchState };

/**
 * One punch per installment, in order: already due (paid), the first one still ahead (next), the rest (upcoming).
 * "Paid" follows the plan rows: an installment counts once its due date has been reached.
 */
export function punchesFor(installments: { seq: number; due_date: ISODate; amount_base: number }[], today: ISODate): Punch[] {
  const sorted = [...installments].sort((a, b) => a.seq - b.seq);
  let nextSeen = false;
  return sorted.map((i) => {
    const paid = i.due_date <= today;
    const state: PunchState = paid ? "paid" : nextSeen ? "upcoming" : "next";
    if (!paid) nextSeen = true;
    return { seq: i.seq, due: i.due_date, amount: Number(i.amount_base), state };
  });
}
