import { SettingsPage } from "@/components/settings/section";
import { ListEditor } from "@/components/settings/list-editor";
import { getReferenceData } from "@/lib/data/reference";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "People" };

export default async function Page() {
  const ref = await getReferenceData();
  const { supabase } = await requireUser();
  const uses = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("transactions").select("paid_by_id").not("paid_by_id", "is", null).range(from, from + 999);
    for (const r of data ?? []) uses.set(r.paid_by_id!, (uses.get(r.paid_by_id!) ?? 0) + 1);
    if (!data || data.length < 1000) break;
  }
  const items = ref.people.map((p) => ({ id: p.id, name: p.name, archived: p.archived, is_self: "is_self" in p ? (p.is_self as boolean) : undefined, uses: uses.get(p.id) ?? 0 }));
  return (
    <SettingsPage title="People" description="Archived items stay on old transactions but are hidden from pickers. Deleting clears them from transactions.">
      <ListEditor table="people" items={items} noun="person" />
    </SettingsPage>
  );
}
