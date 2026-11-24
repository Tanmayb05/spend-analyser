import { SettingsPage } from "@/components/settings/section";
import { ListEditor } from "@/components/settings/list-editor";
import { getReferenceData } from "@/lib/data/reference";
import { requireUser } from "@/lib/supabase/server";
import { HELP } from "@/lib/help";
import { SettleUpCard } from "@/components/people/settle-up-card";
import { settleSentence, settleUp, type SettleTxn } from "@/lib/analytics/settle-up";
import { formatMoney } from "@/lib/money";
import { monogram } from "@/lib/monogram";

export const metadata = { title: "People" };

export default async function Page() {
  const ref = await getReferenceData();
  const { supabase } = await requireUser();
  const uses = new Map<string, number>();
  const txns: SettleTxn[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("transactions").select("type, paid_by_id, base_amount").order("id").range(from, from + 999);
    for (const r of data ?? []) {
      txns.push({ type: r.type, paid_by_id: r.paid_by_id, base_amount: r.base_amount });
      if (r.paid_by_id) uses.set(r.paid_by_id, (uses.get(r.paid_by_id) ?? 0) + 1);
    }
    if (!data || data.length < 1000) break;
  }
  const currency = ref.profile.base_currency;
  const settle = settleUp(txns, ref.people);
  const me = ref.people.find((p) => p.is_self);
  const rows = settle.rows.map((r) => ({
    id: r.id,
    name: r.name,
    initials: r.initials,
    color: r.color,
    sentence: settleSentence(r.name, r.net, formatMoney(Math.abs(r.net), currency)),
    tone: r.net > 0 ? ("owe" as const) : r.net < 0 ? ("owed" as const) : ("settled" as const),
    net: formatMoney(Math.abs(r.net), currency),
    youPaid: formatMoney(settle.youPaid, currency),
    theyPaid: formatMoney(r.fronted, currency),
    youShare: r.youShare,
    theyShare: r.theyShare,
  }));
  const summary =
    settle.totalNet > 0
      ? `You owe ${formatMoney(settle.totalNet, currency)} in total`
      : settle.totalNet < 0
        ? `You are owed ${formatMoney(-settle.totalNet, currency)} in total`
        : "You are all square";
  const items = ref.people.map((p) => ({ id: p.id, name: p.name, archived: p.archived, is_self: "is_self" in p ? (p.is_self as boolean) : undefined, uses: uses.get(p.id) ?? 0 }));
  return (
    <SettingsPage title="People" info={HELP.people} description="Archived items stay on old transactions but are hidden from pickers. Deleting clears them from transactions.">
      <SettleUpCard rows={rows} youInitials={me ? monogram(me.name) : "You"} summary={summary} basis={`From Paid by on every transaction, all time, in ${currency}`} />
      <ListEditor table="people" items={items} noun="person" />
    </SettingsPage>
  );
}
