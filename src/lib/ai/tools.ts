/**
 * Read-only tools the Q&A model can call. They only ever read through `deps.ledger`, which is the
 * signed-in user's RLS-scoped ledger, take typed arguments (no SQL, no ids), and return small summaries.
 */
import { tool } from "ai";
import { z } from "zod";
import type { Category, LedgerRow, Subcategory } from "@/lib/data/types";

export const MAX_RANGE_MONTHS = 36;

type Row = Pick<LedgerRow, "month" | "entry_date" | "spend" | "income" | "category_id" | "subcategory_id" | "merchant_name" | "description" | "is_scheduled">;

export type ToolDeps = {
  ledger: (from: string, to: string) => Promise<Row[]>;
  categories: Category[];
  subcategories: Subcategory[];
  today: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const month = z.string().regex(/^\d{4}-\d{2}$/).describe("YYYY-MM");

function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function lastDay(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

/** Order the months, cap the span at MAX_RANGE_MONTHS (keeping the end), return ISO date bounds. */
export function rangeOf(fromMonth: string, toMonth: string) {
  const [start, b] = fromMonth <= toMonth ? [fromMonth, toMonth] : [toMonth, fromMonth];
  const earliest = addMonths(b, -(MAX_RANGE_MONTHS - 1));
  const a = start < earliest ? earliest : start;
  return { from: `${a}-01`, to: lastDay(b), months: { from: a, to: b } };
}

export function buildFinanceTools(deps: ToolDeps) {
  const cache = new Map<string, Promise<Row[]>>();
  const rows = async (fromMonth: string, toMonth: string) => {
    const r = rangeOf(fromMonth, toMonth);
    const key = `${r.from}|${r.to}`;
    if (!cache.has(key)) cache.set(key, deps.ledger(r.from, r.to));
    // posted entries only: future-dated (scheduled) rows haven't happened yet
    return (await cache.get(key)!).filter((x) => !x.is_scheduled && x.entry_date <= deps.today);
  };
  const catName = (id: string | null) => deps.categories.find((c) => c.id === id)?.name ?? "Uncategorized";
  const subName = (id: string | null) => (id ? (deps.subcategories.find((s) => s.id === id)?.name ?? null) : null);
  const catId = (name: string | null) => {
    if (!name) return { id: null as string | null };
    const c = deps.categories.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    return c ? { id: c.id } : { error: `Unknown category "${name}". Use one of: ${deps.categories.map((x) => x.name).join(", ")}` };
  };

  return {
    monthly_totals: tool({
      description: "Total spent, income and net saved per month in a range.",
      inputSchema: z.object({ from_month: month, to_month: month }),
      execute: async ({ from_month, to_month }) => {
        const rr = await rows(from_month, to_month);
        const by = new Map<string, { spent: number; income: number }>();
        for (const x of rr) {
          const k = x.month.slice(0, 7);
          const t = by.get(k) ?? { spent: 0, income: 0 };
          t.spent += Number(x.spend);
          t.income += Number(x.income);
          by.set(k, t);
        }
        return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, t]) => ({ month: m, spent: r2(t.spent), income: r2(t.income), net: r2(t.income - t.spent) }));
      },
    }),

    category_breakdown: tool({
      description: "Spending (or income) per category in a range, biggest first, with the top subcategories.",
      inputSchema: z.object({ from_month: month, to_month: month, kind: z.enum(["expense", "income"]) }),
      execute: async ({ from_month, to_month, kind }) => {
        const rr = await rows(from_month, to_month);
        const by = new Map<string, { total: number; subs: Map<string, number> }>();
        for (const x of rr) {
          const v = Number(kind === "income" ? x.income : x.spend);
          if (!v) continue;
          const c = by.get(x.category_id) ?? { total: 0, subs: new Map() };
          c.total += v;
          const s = subName(x.subcategory_id);
          if (s) c.subs.set(s, (c.subs.get(s) ?? 0) + v);
          by.set(x.category_id, c);
        }
        const grand = [...by.values()].reduce((a, c) => a + c.total, 0);
        return {
          total: r2(grand),
          categories: [...by.entries()]
            .sort(([, a], [, b]) => b.total - a.total)
            .slice(0, 15)
            .map(([id, c]) => ({
              category: catName(id),
              total: r2(c.total),
              share: grand ? r2((c.total / grand) * 100) : 0,
              subcategories: [...c.subs.entries()].sort(([, a], [, b]) => b - a).slice(0, 5).map(([name, total]) => ({ name, total: r2(total) })),
            })),
        };
      },
    }),

    top_merchants: tool({
      description: "Where money was spent: merchants by total spend in a range, optionally within one category.",
      inputSchema: z.object({ from_month: month, to_month: month, category: z.string().nullable(), limit: z.number().int().min(1).max(20) }),
      execute: async ({ from_month, to_month, category, limit }) => {
        const c = catId(category);
        if ("error" in c) return { error: c.error };
        const by = new Map<string, { total: number; count: number }>();
        for (const x of await rows(from_month, to_month)) {
          if (c.id && x.category_id !== c.id) continue;
          if (!Number(x.spend)) continue;
          const k = x.merchant_name || "(no merchant)";
          const t = by.get(k) ?? { total: 0, count: 0 };
          t.total += Number(x.spend);
          t.count += 1;
          by.set(k, t);
        }
        return [...by.entries()].sort(([, a], [, b]) => b.total - a.total).slice(0, limit).map(([merchant, t]) => ({ merchant, total: r2(t.total), count: t.count }));
      },
    }),

    find_transactions: tool({
      description: "Find individual entries by text (merchant or description), category and minimum amount. Returns the count, total and up to 25 rows.",
      inputSchema: z.object({
        from_month: month,
        to_month: month,
        text: z.string().max(60).nullable(),
        category: z.string().nullable(),
        min_amount: z.number().nullable(),
        kind: z.enum(["expense", "income"]),
      }),
      execute: async ({ from_month, to_month, text, category, min_amount, kind }) => {
        const c = catId(category);
        if ("error" in c) return { error: c.error };
        const q = (text ?? "").trim().toLowerCase();
        const hits = (await rows(from_month, to_month))
          .map((x) => ({ x, v: Number(kind === "income" ? x.income : x.spend) }))
          .filter(({ x, v }) => v !== 0 && (!c.id || x.category_id === c.id) && (min_amount == null || v >= min_amount))
          .filter(({ x }) => !q || `${x.merchant_name ?? ""} ${x.description ?? ""}`.toLowerCase().includes(q))
          .sort((a, b) => b.x.entry_date.localeCompare(a.x.entry_date));
        return {
          count: hits.length,
          total: r2(hits.reduce((a, h) => a + h.v, 0)),
          rows: hits.slice(0, 25).map(({ x, v }) => ({ date: x.entry_date, merchant: x.merchant_name, description: x.description, category: catName(x.category_id), amount: r2(v) })),
        };
      },
    }),
  };
}
