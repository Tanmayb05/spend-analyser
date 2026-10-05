import { SettingsPage } from "@/components/settings/section";
import { MerchantsEditor } from "@/components/settings/merchants-editor";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Merchants" };

export default async function MerchantsPage() {
  const { supabase } = await requireUser();
  const stats: Record<string, { count: number; total: number }> = {};
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("transactions").select("merchant_id,base_amount,type").not("merchant_id", "is", null).range(from, from + 999);
    for (const r of data ?? []) {
      const s = (stats[r.merchant_id!] ??= { count: 0, total: 0 });
      s.count += 1;
      s.total += r.type === "refund" ? -Number(r.base_amount) : r.type === "expense" ? Number(r.base_amount) : 0;
    }
    if (!data || data.length < 1000) break;
  }
  return (
    <SettingsPage title="Merchants" description="Merchants are learned as you add transactions. Each remembers the last category you used.">
      <MerchantsEditor stats={stats} />
    </SettingsPage>
  );
}
