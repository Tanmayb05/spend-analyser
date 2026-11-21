import { Card, CardHeader, Insight } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { TrendBars } from "@/components/charts/trend-bars";
import { ACCENT } from "@/components/charts/colors";
import { PlanRow, type PlanView } from "@/components/plans/plan-row";
import { StatStrip } from "@/components/cards/stat-strip";
import { AddPlanButton } from "@/components/plans/add-plan-button";
import { getReferenceData } from "@/lib/data/reference";
import { requireUser } from "@/lib/supabase/server";
import { addMonths, formatMonth, monthStart } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { round2 } from "@/lib/utils";
import { HELP } from "@/lib/help";

export type PlanKind = "spread" | "emi";

type Row = {
  kind: "spread" | "emi";
  transactions: { id: string; description: string | null; category_id: string; base_amount: number; merchants: { name: string } | null } | null;
  installments: { seq: number; due_date: string; amount_base: number }[];
};

/**
 * One kind of plan: stats, 12-month commitment chart, active and finished lists.
 * Transactions → Plans shows `spread` (paid upfront, counted monthly); Transactions → EMIs shows `emi` (paid off in installments).
 */
export async function PlansView({ kind }: { kind: PlanKind }) {
  const ref = await getReferenceData();
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("spread_plans")
    .select("kind, transactions(id, description, category_id, base_amount, merchants(name)), installments(seq, due_date, amount_base)")
    .returns<Row[]>();
  const today = ref.today;
  const rowsAll = (data ?? []).filter((r) => r.kind === kind);
  const emi = kind === "emi";
  const noun = emi ? "EMIs" : "plans";
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
              { label: emi ? "Active EMIs" : "Active plans", value: String(active.length) },
              { label: emi ? "Still to pay" : "Still to count", value: formatMoney(remaining, currency, { whole: true }), money: true },
              { label: emi ? "Due next month" : "Counts next month", value: formatMoney(nextMonth, currency, { whole: true }), money: true },
              { label: "Finished", value: String(finished.length) },
            ]}
          />

          <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
            <Card className="flex min-w-0 flex-col">
              <CardHeader
                title={emi ? "How much is already committed?" : "How much is still to come?"}
                subtitle={emi ? "EMI installments due in the next 12 months" : "Monthly parts of your plans over the next 12 months"}
                info={emi ? HELP.emisCommitted : HELP.plansCommitted}
              />
              {/* flex-1 wrapper: the chart fills the card's spare height instead of overflowing it (TrendBars is h-full) */}
              <div className="min-h-0 flex-1">
                <TrendBars data={outlook} selected={months[0]} currency={currency} aLabel={emi ? "Committed" : "Counts"} aColor={ACCENT} height={180} />
              </div>
              <Insight>
                {peak && peak.a > 0
                  ? `Heaviest month: ${formatMonth(peak.month)} at ${formatMoney(peak.a, currency, { whole: true })}.${freeBy > 0 ? ` From ${formatMonth(months[freeBy])} nothing is committed yet.` : ""}`
                  : `Nothing from your ${noun} lands in the next 12 months.`}
              </Insight>
            </Card>
            <Card className="min-w-0">
              <CardHeader title="Active" />
              {active.length ? active.map((p) => <PlanRow key={p.txnId} p={p} />) : <p className="py-6 text-center text-sm text-muted">No active {noun}</p>}
            </Card>
          </section>

          {finished.length ? (
            <Card className="mt-4">
              <details>
                <summary className="card-title cursor-pointer list-none">
                  Finished <span className="text-sm font-normal text-muted">· {finished.length} {finished.length === 1 ? noun.slice(0, -1) : noun} · tap to show</span>
                </summary>
                <div className="mt-3">{finished.map((p) => <PlanRow key={p.txnId} p={p} />)}</div>
              </details>
            </Card>
          ) : null}
        </>
      ) : (
        <Card>
          {emi ? (
            <EmptyState
              title="No EMIs yet"
              body={<>Bought something on installments? Add the purchase, turn on <b className="font-medium text-text">Spread this cost</b> and choose <b className="font-medium text-text">Paying in EMIs</b>. Each installment counts in the month it&apos;s due, and you&apos;ll see what&apos;s left to pay here.</>}
              action={<AddPlanButton kind="emi" />}
            />
          ) : (
            <EmptyState
              title="No plans yet"
              body={<>Paid for something big in one go, like a laptop or a year of insurance? Add it, turn on <b className="font-medium text-text">Spread this cost</b> and keep <b className="font-medium text-text">Paid upfront</b>. It then counts a slice each month instead of all at once.</>}
              action={<AddPlanButton kind="spread" />}
            />
          )}
        </Card>
      )}
    </>
  );
}
