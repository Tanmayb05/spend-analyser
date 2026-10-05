"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { categoryColor } from "@/components/charts/colors";
import { useAction } from "@/hooks/use-action";
import { addMonths, formatMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { resolveBudget, budgetTotals, budgetsForMonth } from "@/lib/analytics/budgets";
import { cn } from "@/lib/utils";
import { setBudget } from "@/app/(app)/settings/actions";
import type { Budget, Category } from "@/lib/data/types";

export function BudgetsEditor({
  month,
  categories,
  budgets,
  actual,
  lastActual,
  currency,
}: {
  month: string;
  categories: Category[];
  budgets: Budget[];
  actual: Record<string, number>;
  lastActual: Record<string, number>;
  currency: string;
}) {
  const router = useRouter();
  const active = categories.filter((c) => !c.archived);
  const totals = budgetTotals(budgetsForMonth(budgets, active, month), active);
  const go = (m: string) => router.push(`?m=${m.slice(0, 7)}`, { scroll: false });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center rounded-full border border-border bg-surface-2 p-1">
          <button type="button" onClick={() => go(addMonths(month, -1))} aria-label="Previous month" className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-3"><ChevronLeft size={18} /></button>
          <span className="min-w-36 px-2 text-center text-sm font-medium">{formatMonth(month)}</span>
          <button type="button" onClick={() => go(addMonths(month, 1))} aria-label="Next month" className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-3"><ChevronRight size={18} /></button>
        </div>
        <p className="text-sm text-muted">Each month uses the last budget you set. Changing it here applies from {formatMonth(month)} onward.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          ["Total budget", totals.total],
          ["Core budget", totals.core],
          ["Income target", totals.incomeTarget],
        ].map(([k, v]) => (
          <Card key={k as string} className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{k}</p>
            <p className="num mt-1 text-2xl font-medium sm:text-3xl">{formatMoney(v as number, currency, { whole: true })}</p>
          </Card>
        ))}
      </div>

      {(["expense", "income"] as const).map((kind) => (
        <Card key={kind} className="p-0 sm:p-0">
          <div className="hidden grid-cols-[1fr_140px_110px_110px] gap-3 border-b border-border px-5 py-3 text-xs uppercase tracking-wide text-muted sm:grid">
            <span>{kind === "expense" ? "Category" : "Income target"}</span>
            <span>Budget / month</span>
            <span className="text-right">Last month</span>
            <span className="text-right">This month</span>
          </div>
          <ul className="divide-y divide-border">
            {active.filter((c) => c.kind === kind).map((c) => (
              <BudgetRow key={c.id} category={c} month={month} budgets={budgets.filter((b) => b.category_id === c.id)} actual={actual[c.id] ?? 0} last={lastActual[c.id] ?? 0} currency={currency} />
            ))}
          </ul>
        </Card>
      ))}
    </>
  );
}

function BudgetRow({ category, month, budgets, actual, last, currency }: { category: Category; month: string; budgets: Budget[]; actual: number; last: number; currency: string }) {
  const resolved = resolveBudget(budgets, category.id, month);
  const [value, setValue] = useState(resolved.amount ? String(resolved.amount) : "");
  const [ask, setAsk] = useState(false);
  const [history, setHistory] = useState(false);
  const a = useAction();
  const later = budgets.filter((b) => b.effective_month > month);
  const dirty = Number(value || 0) !== resolved.amount;
  const over = resolved.amount > 0 && actual > resolved.amount;

  const save = (replaceFuture: boolean) => {
    setAsk(false);
    a.run(() => setBudget(category.id, month, Number(value || 0), replaceFuture));
  };

  return (
    <li className="px-5 py-3">
      <div className="grid grid-cols-[1fr_auto] items-center gap-3 sm:grid-cols-[1fr_140px_110px_110px]">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            <span className="h-3 w-3 shrink-0 rounded-[4px]" style={{ background: categoryColor(category) }} />
            <span className="truncate">{category.name}</span>
          </p>
          <button type="button" onClick={() => setHistory((h) => !h)} className="mt-0.5 inline-flex items-center gap-1 text-xs text-faint hover:text-text">
            <History size={11} />
            {resolved.since ? `since ${formatMonth(resolved.since)}` : "not set"}
            {later.length ? ` · ${later.length} later change${later.length > 1 ? "s" : ""}` : ""}
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!dirty) return;
            if (later.length) setAsk(true);
            else save(true);
          }}
          className="flex items-center gap-1"
        >
          <input
            aria-label={`Budget for ${category.name}`}
            type="number"
            inputMode="decimal"
            min={0}
            step="1"
            placeholder="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="num h-10 w-28 rounded-xl border border-border bg-surface-2 px-3 text-right outline-none focus:border-accent"
          />
          {dirty ? <Button type="submit" size="sm" disabled={a.pending}>Save</Button> : null}
        </form>
        <span className="num hidden text-right text-sm text-muted sm:block">{formatMoney(last, currency, { whole: true })}</span>
        <span className={cn("num hidden text-right text-sm sm:block", over ? "text-bad" : "text-text")}>{formatMoney(actual, currency, { whole: true })}</span>
      </div>
      <p className="mt-1 text-xs text-muted sm:hidden">
        Last month {formatMoney(last, currency, { whole: true })} · This month <span className={over ? "text-bad" : ""}>{formatMoney(actual, currency, { whole: true })}</span>
      </p>

      {ask ? (
        <div className="mt-3 rounded-2xl bg-warn/10 p-3 text-sm">
          <p className="text-warn">
            {category.name} has {later.length} later budget change{later.length > 1 ? "s" : ""} ({later.map((b) => formatMonth(b.effective_month, "short") + " " + b.effective_month.slice(0, 4)).join(", ")}).
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => save(true)}>Use {formatMoney(Number(value || 0), currency, { whole: true })} from now on</Button>
            <Button size="sm" variant="outline" onClick={() => save(false)}>Keep later changes</Button>
          </div>
        </div>
      ) : null}

      {history && budgets.length ? (
        <ul className="mt-2 space-y-1 rounded-2xl bg-surface-2 p-3 text-xs text-muted">
          {budgets.map((b) => (
            <li key={b.id} className="flex justify-between">
              <span>From {formatMonth(b.effective_month)}</span>
              <span className="num text-text">{formatMoney(Number(b.amount), currency)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
