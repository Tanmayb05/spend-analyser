"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { formatMoney } from "@/lib/money";
import { buildBundle, type ImportReport, type Rows } from "@/lib/import/workbook";
import { importBundle } from "@/app/(app)/settings/data/actions";
import { HELP } from "@/lib/help";

export function ImportCard({ hasTransactions, currency }: { hasTransactions: boolean; currency: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<{ settings?: Rows; expenses: Rows } | null>(null);
  const [tripMode, setTripMode] = useState<"itemized" | "excluded">("itemized");
  const [replace, setReplace] = useState(!hasTransactions);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  let report: ImportReport | null = null;
  try {
    report = sheets ? buildBundle(sheets, { tripMode, replaceDefaults: replace && !hasTransactions }) : null;
  } catch (e) {
    if (!error) setError((e as Error).message);
  }

  async function onFile(f: File) {
    setError(null);
    setFileName(f.name);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const toRows = (name: string) => XLSX.utils.sheet_to_json<Rows[number]>(wb.Sheets[name], { header: 1, raw: true, defval: null }) as Rows;
      const expensesName = wb.SheetNames.find((n) => n.toLowerCase() === "expenses") ?? wb.SheetNames[0];
      const settingsName = wb.SheetNames.find((n) => n.toLowerCase() === "settings");
      setSheets({ expenses: toRows(expensesName), settings: settingsName ? toRows(settingsName) : undefined });
    } catch (e) {
      setSheets(null);
      setError(`Couldn't read that file: ${(e as Error).message}`);
    }
  }

  function doImport() {
    if (!report) return;
    start(async () => {
      const res = await importBundle(report!.bundle);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Imported ${res.transactions} transactions and ${res.plans} installment plans`);
      setSheets(null);
      setFileName(null);
      router.push("/");
    });
  }

  return (
    <Card>
      <CardHeader title="Import" info={HELP.importer} subtitle="Your Expense Tracker workbook, or any .xlsx / .csv with Date, Type, Category, Amount columns." />
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="sr-only"
        aria-label="Choose file to import"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="flex w-full flex-col items-center gap-2 rounded-3xl border border-dashed border-border px-6 py-8 text-center hover:bg-surface-2"
      >
        {fileName ? <FileSpreadsheet className="text-accent" /> : <Upload className="text-muted" />}
        <span className="font-medium">{fileName ?? "Choose a file"}</span>
        <span className="text-xs text-muted">Nothing is saved until you confirm.</span>
      </button>
      {error ? <p className="mt-3 rounded-2xl bg-bad/10 px-4 py-3 text-sm text-bad">{error}</p> : null}

      {report ? (
        <div className="mt-5 space-y-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Rows", report.stats.rows],
              ["Transactions", report.stats.transactions],
              ["EMI plans", `${report.stats.plans} (${report.stats.installmentRows} rows)`],
              ["Categories", report.stats.categories],
              ["Trips", report.stats.trips],
              ["Receipts", report.stats.receipts],
              ["Expenses", formatMoney(report.stats.totals.expense, currency, { whole: true })],
              ["Income", formatMoney(report.stats.totals.income, currency, { whole: true })],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-2xl bg-surface-2 p-3">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="num mt-1 text-lg font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {report.stats.skipped.length ? (
            <details className="rounded-2xl bg-warn/10 px-4 py-3 text-sm text-warn">
              <summary>{report.stats.skipped.length} rows will be skipped</summary>
              <ul className="mt-2 space-y-1">
                {report.stats.skipped.slice(0, 20).map((s) => (
                  <li key={s.row}>Row {s.row}: {s.reason}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {report.stats.trips ? (
            <div className="space-y-2">
              <p className="text-sm">Count trip expenses in monthly spending?</p>
              <Segmented
                value={tripMode}
                onChange={setTripMode}
                options={[
                  { value: "itemized", label: "Yes, each expense (matches Excel)" },
                  { value: "excluded", label: "No, keep trips separate" },
                ]}
                size="sm"
              />
            </div>
          ) : null}
          {!hasTransactions && sheets?.settings ? (
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[var(--accent)]" />
              <span>
                Replace the default categories with the ones from this workbook
                <span className="block text-xs text-muted">Recommended for a fresh account.</span>
              </span>
            </label>
          ) : null}
          <Button size="lg" className="w-full" onClick={doImport} disabled={pending}>
            {pending ? "Importing…" : `Import ${report.stats.transactions} transactions`}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
