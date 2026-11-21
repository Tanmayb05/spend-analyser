import { SettingsPage } from "@/components/settings/section";
import { ListEditor } from "@/components/settings/list-editor";
import { getReferenceData } from "@/lib/data/reference";
import { requireUser } from "@/lib/supabase/server";
import { HELP } from "@/lib/help";

export const metadata = { title: "Payment methods" };

export default async function Page() {
  const ref = await getReferenceData();
  const { supabase } = await requireUser();
  const uses = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("transactions").select("payment_method_id").not("payment_method_id", "is", null).range(from, from + 999);
    for (const r of data ?? []) uses.set(r.payment_method_id!, (uses.get(r.payment_method_id!) ?? 0) + 1);
    if (!data || data.length < 1000) break;
  }
  const { data: numbers } = await supabase.from("payment_method_cards").select("payment_method_id, last4").order("created_at");
  const last4s = new Map<string, string[]>();
  for (const n of numbers ?? []) last4s.set(n.payment_method_id, [...(last4s.get(n.payment_method_id) ?? []), n.last4]);
  const items = ref.paymentMethods.map((p) => ({ id: p.id, name: p.name, archived: p.archived, is_self: "is_self" in p ? (p.is_self as boolean) : undefined, uses: uses.get(p.id) ?? 0 }));
  return (
    <SettingsPage title="Payment methods" info={HELP.payments} description="Tap the star to pre-select a method on new transactions. Tap the sliders to add a nickname, issuer and last 4 digits so receipts find the card. Tap the card icon to track a credit card limit and bills. Archived items stay on old transactions but are hidden from pickers. Deleting clears them from transactions.">
      <ListEditor
        table="payment_methods"
        items={items}
        noun="payment method"
        defaultId={ref.profile.default_payment_method_id}
        currency={ref.profile.base_currency}
        today={ref.today}
        details={Object.fromEntries(
          ref.paymentMethods.map((p) => [p.id, { id: p.id, name: p.name, nickname: p.nickname, issuer: p.issuer, network: p.network, color: p.color, last4s: last4s.get(p.id) ?? [] }]),
        )}
        cards={Object.fromEntries(
          ref.paymentMethods.map((p) => [
            p.id,
            {
              id: p.id,
              name: p.name,
              is_credit_card: p.is_credit_card,
              credit_limit: p.credit_limit === null ? null : Number(p.credit_limit),
              statement_day: p.statement_day,
              due_day: p.due_day,
              opening_balance: Number(p.opening_balance),
              tracking_from: p.tracking_from,
              min_due_pct: p.min_due_pct === null ? null : Number(p.min_due_pct),
              min_due_floor: p.min_due_floor === null ? null : Number(p.min_due_floor),
            },
          ]),
        )}
      />
    </SettingsPage>
  );
}
