import { Download } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { SettingsPage } from "@/components/settings/section";
import { ImportCard } from "@/components/settings/import-card";
import { TypeToConfirm } from "@/components/settings/danger-delete";
import { requireUser } from "@/lib/supabase/server";
import { getReferenceData } from "@/lib/data/reference";
import { deleteAllTransactions } from "./actions";

export const metadata = { title: "Import & export" };

export default async function DataPage() {
  const { supabase } = await requireUser();
  const ref = await getReferenceData();
  const { count } = await supabase.from("transactions").select("id", { count: "exact", head: true });

  const exports = [
    { href: "/api/export?format=xlsx", label: "Excel (.xlsx)", desc: "Same columns as your tracker. Re-importable." },
    { href: "/api/export?format=csv", label: "CSV", desc: "For any spreadsheet or tool." },
    { href: "/api/export?format=json", label: "Full backup (.json)", desc: "Every table: categories, budgets, plans, receipts." },
  ];

  return (
    <SettingsPage title="Import & export" description={`${count ?? 0} transactions in your account.`}>
      <ImportCard hasTransactions={(count ?? 0) > 0} currency={ref.profile.base_currency} />
      <Card>
        <CardHeader title="Export" subtitle="Download your data any time." />
        <ul className="grid gap-2 sm:grid-cols-3">
          {exports.map((e) => (
            <li key={e.href}>
              <a href={e.href} download className="flex h-full flex-col gap-1 rounded-2xl border border-border bg-surface-2 p-4 hover:bg-surface-3">
                <span className="flex items-center gap-2 font-medium">
                  <Download size={16} /> {e.label}
                </span>
                <span className="text-xs text-muted">{e.desc}</span>
              </a>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="border-bad/30">
        <CardHeader title="Delete all transactions" subtitle="Removes every transaction, plan and installment. Categories, budgets and settings stay. This can't be undone; export a backup first." />
        <TypeToConfirm label="Delete all transactions" action={deleteAllTransactions} />
      </Card>
    </SettingsPage>
  );
}
