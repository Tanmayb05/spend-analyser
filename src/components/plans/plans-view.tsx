import { Card, CardHeader, Insight } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { TrendBars } from "@/components/charts/trend-bars";
import { ACCENT } from "@/components/charts/colors";
import type { PlanView } from "@/components/plans/plan-ticket";
import { PlanGroup } from "@/components/plans/plan-group";
import { StatStrip } from "@/components/cards/stat-strip";
import { MoneyFlow } from "@/components/ui/money-flow";
import { AddPlanButton } from "@/components/plans/add-plan-button";
import { getReferenceData } from "@/lib/data/reference";
import { requireUser } from "@/lib/supabase/server";
import { addMonths, formatMonth, monthStart } from "@/lib/dates";
import { punchesFor } from "@/lib/plan-punches";
import { formatMoney } from "@/lib/money";
import { round2 } from "@/lib/utils";
import { HELP } from "@/lib/help";

type Row = {
  kind: "spread" | "emi";
  interest: number | null;
  transactions: { id: string; date: string; description: string | null; category_id: string; base_amount: number; merchants: { name: string } | null } | null;
  installments: { seq: number; due_date: string; amount_base: number }[];
};

/**
 * Every plan in one view: stats, 12-month chart, active and finished lists.
 * Paid-upfront spreads and EMIs share it; each ticket carries a badge for which it is.
 */
export async function PlansView() {
  const ref = await getReferenceData();
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("spread_plans")
    .select("kind, interest, transactions(id, date, description, category_id, base_amount, merchants(name)), installments(seq, due_date, amount_base)")
    .returns<Row[]>();
  const today = ref.today;
  const rowsAll = data ?? [];
  const currency = ref.profile.base_currency;

  const plans: PlanView[] = rowsAll
    .filter((r) => r.transactions)
    .map((r) => {
      const inst = [...r.installments].sort((a, b) => a.seq - b.seq);
      const paidRows = inst.filter((i) => i.due_date <= today);
      const t = r.transactions!;
      return {
        txnId: t.id,
        name: [t.merchants?.name, t.description].filter(Boolean).join(" · ") || "Plan",
        categoryId: t.category_id,
        kind: r.kind,
        total: round2(inst.reduce((a, i) => a + Number(i.amount_base), 0)),
        paid: round2(paidRows.reduce((a, i) => a + Number(i.amount_base), 0)),
        paidCount: paidRows.length,
        count: inst.length,
        perMonth: Number(inst[0]?.amount_base ?? 0),
        nextDue: inst.find((i) => i.due_date > today)?.due_date ?? null,
        lastDue: inst.at(-1)?.due_date ?? null,
        punches: punchesFor(inst, today),
        purchaseDate: t.date,
        purchaseAmount: Number(t.base_amount),
        interest: Number(r.interest ?? 0),
      };
    });

  const active = plans.filter((p) => p.paidCount < p.count).sort((a, b) => (a.nextDue ?? "").localeCompare(b.nextDue ?? ""));
  const finished = plans.filter((p) => p.paidCount >= p.count).sort((a, b) => (b.lastDue ?? "").localeCompare(a.lastDue ?? ""));
  const remaining = active.reduce((a, p) => a + p.total - p.paid, 0);
  const thisMonth = monthStart(today);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, i + 1));
  const outlook = months.map((m) => ({
    month: m,
    a: round2(
      rowsAll.flatMap((r) => r.installments).filter((i) => monthStart(i.due_date) === m).reduce((a, i) => a + Number(i.amount_base), 0),
    ),
  }));
  const peak = [...outlook].sort((a, b) => b.a - a.a)[0];
  const nextMonth = outlook[0]?.a ?? 0;
  const freeBy = outlook.findIndex((o) => o.a === 0);

  return (
    <>
      {plans.length ? (
        <>
          <StatStrip
            stats={[
              { label: "Active plans", value: String(active.length) },
              { label: "Remaining", value: <MoneyFlow value={remaining} currency={currency} whole />, money: true },
              { label: "Next month", value: <MoneyFlow value={nextMonth} currency={currency} whole />, money: true },
              { label: "Finished", value: String(finished.length) },
            ]}
          />

          <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
            <Card className="flex min-w-0 flex-col">
              <CardHeader
                title="How much is still to come?"
                subtitle="Monthly parts and installments over the next 12 months"
                info={HELP.plansCommitted}
              />
              {/* flex-1 wrapper: the chart fills the card's spare height instead of overflowing it (TrendBars is h-full) */}
              <div className="min-h-0 flex-1">
                <TrendBars data={outlook} selected={months[0]} currency={currency} aLabel="Lands" aColor={ACCENT} height={180} />
              </div>
              <Insight>
                {peak && peak.a > 0
                  ? `Heaviest month: ${formatMonth(peak.month)} at ${formatMoney(peak.a, currency, { whole: true })}.${freeBy > 0 ? ` From ${formatMonth(months[freeBy])} nothing is committed yet.` : ""}`
                  : "Nothing from your plans lands in the next 12 months."}
              </Insight>
            </Card>
            <div className="min-w-0">
              <CardHeader title="Active" />
              {active.length ? <PlanGroup plans={active} className="grid grid-cols-1 gap-3" /> : <p className="py-6 text-center text-sm text-muted">No active plans</p>}
            </div>
          </section>

          {finished.length ? (
            <details className="mt-5">
              <summary className="card-title cursor-pointer list-none">
                Finished <span className="text-sm font-normal text-muted">· {finished.length} {finished.length === 1 ? "plan" : "plans"} · tap to show</span>
              </summary>
              <PlanGroup plans={finished} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" />
            </details>
          ) : null}
        </>
      ) : (
        <Card>
          <EmptyState
            title="No plans yet"
            body={<>Bought something big? Add it and turn on <b className="font-medium text-text">Spread this cost</b>. Choose <b className="font-medium text-text">Paid upfront</b> to count a slice each month instead of all at once, or <b className="font-medium text-text">Paying in EMIs</b> if you&apos;re paying it off in installments.</>}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <AddPlanButton kind="spread" />
                <AddPlanButton kind="emi" />
              </div>
            }
          />
        </Card>
      )}
    </>
  );
}
