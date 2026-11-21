// Finds file rows that already exist in the account. Pure so it can be unit-tested; the server action
// supplies the existing rows.
//
// A file row matches an existing transaction on the same date and amount when they share a merchant or
// a description (or neither has either). Matching is count-based: if the file has two identical coffees
// and the account has one, only one of them is a duplicate.

import { normKey } from "./values";

export type DupRow = { ref: string; date: string; amount: number; merchant: string | null; description: string | null };
export type ExistingRow = { date: string; amount: number; merchant: string | null; description: string | null };

const bucket = (r: { date: string; amount: number }) => `${r.date}|${r.amount.toFixed(2)}`;
const tokens = (r: { merchant: string | null; description: string | null }) => [normKey(r.merchant ?? ""), normKey(r.description ?? "")].filter(Boolean);

function same(a: string[], b: string[]): boolean {
  if (!a.length && !b.length) return true;
  return a.some((t) => b.includes(t));
}

export function matchDuplicates(file: DupRow[], existing: ExistingRow[]): string[] {
  const pool = new Map<string, string[][]>();
  for (const e of existing) {
    const k = bucket(e);
    const list = pool.get(k) ?? [];
    list.push(tokens(e));
    pool.set(k, list);
  }
  const dups: string[] = [];
  for (const f of file) {
    const list = pool.get(bucket(f));
    if (!list) continue;
    const t = tokens(f);
    const i = list.findIndex((e) => same(t, e));
    if (i < 0) continue;
    list.splice(i, 1);
    dups.push(f.ref);
  }
  return dups;
}
