import { Card, CardHeader, Insight } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { TrendBars } from "@/components/charts/trend-bars";
import { SERIES } from "@/components/charts/colors";
import { PlanRow, type PlanView } from "@/components/plans/plan-row";
import { getReferenceData } from "@/lib/data/reference";
import { requireUser } from "@/lib/supabase/server";
import { addMonths, formatMonth, monthStart } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { round2 } from "@/lib/utils";
import { InfoTitle } from "@/components/ui/info-title";
import { HELP } from "@/lib/help";

export const metadata = { title: "Plans & EMIs" };

type Row = {
  kind: "spread" | "emi";
  transactions: { id: string; description: string | null; category_id: string; base_amount: number; merchants: { name: string } | null } | null;
  installments: { seq: number; due_date: string; amount_base: number }[];
};

export default async function PlansPage() {
  const ref = await getReferenceData();
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("spread_plans")
    .select("kind, transactions(id, description, category_id, base_amount, merchants(name)), installments(seq, due_date, amount_base)")
    .returns<Row[]>();
  const today = ref.today;
  const currency = ref.profile.base_currency;

  const plans: PlanView[] = (data ?? [])
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
      (data ?? []).flatMap((r) => r.installments).filter((i) => monthStart(i.due_date) === m).reduce((a, i) => a + Number(i.amount_base), 0),
    ),
  }));
  const peak = [...outlook].sort((a, b) => b.a - a.a)[0];
  const nextMonth = outlook[0]?.a ?? 0;
  const freeBy = outlook.findIndex((o) => o.a === 0);

  return (
    <>
      <div className="mb-1">
        <InfoTitle as="h1" info={HELP.plans} className="text-3xl font-medium sm:text-4xl" panelClassName="max-w-xl">Plans & EMIs</InfoTitle>
      </div>
      <p className="mb-5 text-sm text-muted">Big costs split into monthly amounts. Add one from any expense with “Spread this cost”.</p>

      {plans.length ? (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Active plans", String(active.length)],
              ["Still to pay", formatMoney(remaining, currency, { whole: true })],
              ["Due next month", formatMoney(nextMonth, currency, { whole: true })],
              ["Finished", String(finished.length)],
            ].map(([k, v]) => (
              <Card key={k} className="p-4 sm:p-5">
                <p className="text-xs uppercase tracking-wide text-muted">{k}</p>
                <p className="num mt-2 text-3xl font-medium sm:text-4xl">{v}</p>
              </Card>
            ))}
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader title="How much is already committed?" subtitle="Installments due in the next 12 months" info={HELP.plansCommitted} />
              <TrendBars data={outlook} selected={months[0]} currency={currency} aLabel="Committed" aColor={SERIES.spent} height={180} />
              <Insight>
                {peak && peak.a > 0
                  ? `Heaviest month: ${formatMonth(peak.month)} at ${formatMoney(peak.a, currency, { whole: true })}.${freeBy > 0 ? ` From ${formatMonth(months[freeBy])} nothing is committed yet.` : ""}`
                  : "Nothing is committed for the next 12 months."}
              </Insight>
            </Card>
            <Card>
              <CardHeader title="Active" />
              {active.length ? active.map((p) => <PlanRow key={p.txnId} p={p} />) : <p className="py-6 text-center text-sm text-muted">No active plans.</p>}
            </Card>
          </section>

          {finished.length ? (
            <Card className="mt-4">
              <details>
                <summary className="cursor-pointer list-none text-lg font-medium">
                  Finished <span className="text-sm font-normal text-muted">· {finished.length} plans · tap to show</span>
                </summary>
                <div className="mt-3">{finished.map((p) => <PlanRow key={p.txnId} p={p} />)}</div>
              </details>
            </Card>
          ) : null}
        </>
      ) : (
        <EmptyState title="No plans yet" body="When you add a big expense, turn on “Spread this cost” to split it over months. Your averages stay smooth and future months show what's already committed." />
      )}
    </>
  );
}
