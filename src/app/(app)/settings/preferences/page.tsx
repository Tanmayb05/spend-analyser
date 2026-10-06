import { SettingsPage } from "@/components/settings/section";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { getReferenceData } from "@/lib/data/reference";
import { requireUser } from "@/lib/supabase/server";
import { HELP } from "@/lib/help";

export const metadata = { title: "Preferences" };

export default async function PreferencesPage() {
  const ref = await getReferenceData();
  const { supabase } = await requireUser();
  const { count } = await supabase.from("transactions").select("id", { count: "exact", head: true });
  return (
    <SettingsPage title="Preferences" info={HELP.preferences}>
      <PreferencesForm profile={ref.profile} txnCount={count ?? 0} />
    </SettingsPage>
  );
}
