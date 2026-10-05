import { SettingsPage } from "@/components/settings/section";
import { CategoriesEditor } from "@/components/settings/categories-editor";
import { getReferenceData } from "@/lib/data/reference";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const ref = await getReferenceData();
  const { supabase } = await requireUser();
  const uses: Record<string, number> = {};
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("transactions").select("category_id").range(from, from + 999);
    for (const r of data ?? []) uses[r.category_id] = (uses[r.category_id] ?? 0) + 1;
    if (!data || data.length < 1000) break;
  }
  return (
    <SettingsPage title="Categories" description="Tap a category to rename it, change its colour or core flag, or edit subcategories.">
      <CategoriesEditor categories={ref.categories} subcategories={ref.subcategories} uses={uses} />
    </SettingsPage>
  );
}
