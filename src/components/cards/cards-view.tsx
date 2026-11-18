import Link from "next/link";
import { Card, CardHeader, Insight } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { CardTile, UtilMeter } from "./card-tile";
import { getReferenceData } from "@/lib/data/reference";
import { getCardData } from "@/lib/data/cards";
import { overallUtilization, utilBand } from "@/lib/cards";
import { formatDay } from "@/lib/dates";
import { formatMoney, formatPercent } from "@/lib/money";
import { HELP } from "@/lib/help";

/** Transactions → Credit cards: utilization across cards, then one tile per card with its bill and payments. */
export async function CardsView() {
  const ref = await getReferenceData();
  const cards = await getCardData();
  const currency = ref.profile.base_currency;
  const today = ref.today;

  if (!cards.length) {
    return (
      <Card className="mt-4">
        <EmptyState
          title="No credit cards yet"
          body="Mark a payment method as a credit card and add its limit. You'll see what you owe, your next bill and how much of your limit you're using."
          action={<Link href="/settings/payments" className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm text-accent-fg">Set up a card</Link>}
        />
      </Card>
    );
  }

  const all = overallUtilization(cards.map((c) => c.summary));
  const band = all.utilization !== null ? utilBand(all.utilization) : null;
  const bills = cards.flatMap((c) => (c.summary.statement && c.summary.statement.status !== "paid" ? [{ name: c.summary.card.name, ...c.summary.statement }] : []));
  const nextBill = [...bills].sort((a, b) => a.due.localeCompare(b.due))[0];
  const owed = cards.reduce((a, c) => a + Math.max(0, c.summary.outstanding), 0);
  const money = (n: number) => formatMoney(n, currency, { whole: Math.abs(n) >= 1000 });

  return (
    <>
      <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Owed on cards", money(owed)],
          ["Total limit", all.limit ? money(all.limit) : "—"],
          ["Bills to pay", bills.length ? money(bills.reduce((a, b) => a + b.remaining, 0)) : "None"],
          ["Next due", nextBill ? formatDay(nextBill.due) : "—"],
        ].map(([k, v]) => (
          <Card key={k} className="p-4 sm:p-5">
            <p className="text-xs uppercase tracking-wide text-muted">{k}</p>
            <p className="num mt-2 text-2xl font-medium sm:text-3xl">{v}</p>
          </Card>
        ))}
      </section>

      {all.utilization !== null && band ? (
        <Card className="mt-4">
          <CardHeader title="Overall utilization" info={HELP.cardUtilization} action={<Badge tone={band.tone}>{band.label}</Badge>} />
          <div className="flex items-baseline justify-between gap-3">
            <p className="num text-3xl font-medium">{formatPercent(all.utilization)}</p>
            <p className="num text-sm text-muted">{money(all.outstanding)} of {money(all.limit)}</p>
          </div>
          <UtilMeter value={all.utilization} className="mt-3" />
          <Insight>
            {all.utilization <= 0.3
              ? `You're under 30% across your cards, the level credit scores usually reward.${all.utilization > 0.1 ? ` Paying down ${money(all.outstanding - all.limit * 0.1)} would bring you under 10%.` : ""}`
              : `Above the usual 30% guide. Paying ${money(all.outstanding - all.limit * 0.3)} would bring you under it.`}
          </Insight>
        </Card>
      ) : null}

      <section className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        {cards.map((c) => {
          const pm = ref.paymentMethods.find((p) => p.id === c.summary.card.id)!;
          return (
            <CardTile
              key={c.summary.card.id}
              data={c.summary}
              payments={c.payments}
              currency={currency}
              today={today}
              settings={{
                id: pm.id,
                name: pm.name,
                is_credit_card: pm.is_credit_card,
                credit_limit: pm.credit_limit === null ? null : Number(pm.credit_limit),
                statement_day: pm.statement_day,
                due_day: pm.due_day,
                opening_balance: Number(pm.opening_balance),
                tracking_from: pm.tracking_from,
              }}
            />
          );
        })}
      </section>
    </>
  );
}
