"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { formatMoney } from "@/lib/money";
import { buildBundle, UNCATEGORIZED, UNCATEGORIZED_INCOME, type ImportReport, type Skipped } from "@/lib/import/workbook";
import { readImportFile, type ReadResult } from "@/lib/import/read-file";
import { checkDuplicates, importBundle } from "@/app/(app)/settings/data/actions";
import { inboxMatchCountAction } from "@/app/(app)/receipts/actions";
import { ImportGuide } from "./import-guide";
import { ImportDetected, type ImportOptions } from "./import-detected";

// the server action body limit is 4 MB (Vercel's request cap is 4.5 MB)
const MAX_PAYLOAD_CHARS = 3_800_000;

function groupSkipped(skipped: Skipped[]) {
  const m = new Map<string, Skipped[]>();
  for (const s of skipped) m.set(s.reason, [...(m.get(s.reason) ?? []), s]);
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
}

export function ImportCard({ hasTransactions, currency }: { hasTransactions: boolean; currency: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [read, setRead] = useState<ReadResult | null>(null);
  const [options, setOptions] = useState<ImportOptions>({});
  const [tripMode, setTripMode] = useState<"itemized" | "excluded">("itemized");
  const [replace, setReplace] = useState(!hasTransactions);
  const [error, setError] = useState<string | null>(null);
  const [importDups, setImportDups] = useState(false);
  const [pending, start] = useTransition();

  // everything that depends only on the file and the detected settings (also what the duplicate check looks at)
  const core = useMemo(() => {
    if (!read) return { report: null as ImportReport | null, error: null as string | null };
    try {
      return { report: buildBundle(read.sheets, { ...options, baseCurrency: currency }), error: null };
    } catch (e) {
      return { report: null, error: (e as Error).message };
    }
  }, [read, options, currency]);

  // ask the server which rows are already in the account (only possible when it has some)
  const [dupResult, setDupResult] = useState<{ for: ImportReport | null; ok: boolean; refs: string[] }>({ for: null, ok: true, refs: [] });
  const needsCheck = Boolean(hasTransactions && core.report?.bundle.transactions.length);
  useEffect(() => {
    const rep = core.report;
    if (!needsCheck || !rep) return;
    let live = true;
    checkDuplicates(rep.bundle.transactions.map((t) => ({ ref: t.ref, date: t.date, amount: t.amount, merchant: t.merchant, description: t.description }))).then(
      (res) => live && setDupResult({ for: rep, ok: res.ok, refs: res.ok ? res.refs : [] }),
      () => live && setDupResult({ for: rep, ok: false, refs: [] }),
    );
    return () => {
      live = false;
    };
  }, [core.report, needsCheck]);
  const dups = useMemo(() => {
    if (!needsCheck) return { status: "idle" as const, refs: [] as string[] };
    if (dupResult.for !== core.report) return { status: "checking" as const, refs: [] as string[] };
    return { status: dupResult.ok ? ("done" as const) : ("failed" as const), refs: dupResult.refs };
  }, [needsCheck, dupResult, core.report]);

  const report = useMemo(() => {
    if (!read || !core.report) return null;
    try {
      return buildBundle(read.sheets, { ...options, baseCurrency: currency, tripMode, replaceDefaults: replace && !hasTransactions, skipRefs: importDups ? [] : dups.refs });
    } catch {
      return null;
    }
  }, [read, core.report, options, currency, tripMode, replace, hasTransactions, dups.refs, importDups]);

  const payloadTooBig = useMemo(() => (report ? JSON.stringify(report.bundle).length > MAX_PAYLOAD_CHARS : false), [report]);
  const shownError = error ?? core.error;

  async function onFile(f: File) {
    setError(null);
    setFileName(f.name);
    setOptions({});
    setImportDups(false);
    try {
      setRead(await readImportFile(f));
    } catch (e) {
      setRead(null);
      setError((e as Error).message || "Couldn't read that file");
    }
  }

  function doImport() {
    if (!report) return;
    start(async () => {
      const res = await importBundle(report.bundle);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Imported ${res.transactions} transactions and ${res.plans} installment plans`);
      const parked = report.bundle.transactions.filter((t) => t.category === UNCATEGORIZED || t.category === UNCATEGORIZED_INCOME).length;
      setRead(null);
      setFileName(null);
      const hits = await inboxMatchCountAction();
      if (hits.receipts) {
        toast.info(`${hits.receipts} receipt${hits.receipts === 1 ? "" : "s"} in your inbox may match imported transactions.`, {
          action: { label: "Review", onClick: () => router.push("/items?tab=inbox") },
          duration: 12000,
        });
      }
      if (parked) {
        toast.info(`${parked} row${parked === 1 ? "" : "s"} had no category and went to Uncategorized.`, { description: "AI tidy-up can suggest categories for them." });
        router.push("/settings/tidy");
      } else router.push("/");
    });
  }

  const blocked = report?.needsInput.length ? "Choose the highlighted settings above to continue" : dups.status === "checking" ? "Checking for rows you already imported" : null;
  const skippedGroups = report ? groupSkipped(report.stats.skipped) : [];

  return (
    <Card>
      <CardHeader title="Import" subtitle="Your Expense Tracker workbook, or a bank or spreadsheet export (.xlsx, .xls, .csv)" />
      <ImportGuide />
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xls,.csv,.tsv,.txt"
        className="sr-only"
        aria-label="Choose file to import"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = ""; // choosing the same file again should re-read it
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="flex w-full flex-col items-center gap-2 rounded-card border border-dashed border-border px-6 py-8 text-center transition-colors hover:bg-surface-2"
      >
        {fileName ? <FileSpreadsheet className="text-accent" /> : <Upload className="text-muted" />}
        <span className="font-medium">{fileName ?? "Choose a file"}</span>
        <span className="text-xs text-muted">Nothing is saved until you confirm</span>
      </button>
      {hasTransactions && !report ? <p className="mt-3 text-xs text-muted">Importing adds rows to what you have. To start from scratch, use <Link href="/settings/reset" className="text-accent underline-offset-4 hover:underline">Reset or delete</Link>.</p> : null}
      {shownError ? <p role="alert" className="mt-3 rounded-inset bg-bad/10 px-4 py-3 text-sm text-bad">{shownError}</p> : null}

      {report && read ? (
        <div className="mt-5 space-y-4">
          <ImportDetected detected={report.detected} needsInput={report.needsInput} options={options} onChange={setOptions} meta={read.meta} />

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
              <div key={k as string} className="rounded-inset bg-surface-2 p-3">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="num mt-1 text-lg font-medium">{v}</dd>
              </div>
            ))}
          </dl>

          {dups.refs.length ? (
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={importDups} onChange={(e) => setImportDups(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[var(--accent)]" />
              <span>
                Also import the {dups.refs.length} row{dups.refs.length === 1 ? "" : "s"} that look already imported
                <span className="block text-xs text-muted">Same date and amount, and the same merchant or description, as transactions you already have. Skipped unless you tick this</span>
              </span>
            </label>
          ) : null}
          {dups.status === "failed" ? <p className="text-xs text-muted">Couldn&apos;t check for rows you already imported, so none are skipped</p> : null}
          {report.stats.repeated ? <p className="text-xs text-muted">{report.stats.repeated} row{report.stats.repeated === 1 ? " is" : "s are"} identical to another row in this file and will be kept</p> : null}

          {skippedGroups.length ? (
            <details className="rounded-inset bg-warn/10 px-4 py-3 text-sm text-warn">
              <summary>{report.stats.skipped.length} row{report.stats.skipped.length === 1 ? "" : "s"} will be skipped</summary>
              <div className="mt-2 space-y-3">
                {skippedGroups.map(([reason, items]) => (
                  <div key={reason}>
                    <p className="font-medium">{reason} ({items.length})</p>
                    <ul className="mt-1 space-y-1">
                      {items.slice(0, 20).map((s) => (
                        <li key={s.row}>Row {s.row}{s.detail ? `: ${s.detail}` : ""}</li>
                      ))}
                      {items.length > 20 ? <li>and {items.length - 20} more</li> : null}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          {report.warnings.length ? (
            <details className="rounded-inset bg-surface-2 px-4 py-3 text-sm">
              <summary>{report.warnings.length} thing{report.warnings.length === 1 ? "" : "s"} to check</summary>
              <ul className="mt-2 space-y-2 text-muted">
                {report.warnings.map((w) => (
                  <li key={w.kind}>
                    {w.message}
                    {w.rows.length ? ` (${w.rows.length} row${w.rows.length === 1 ? "" : "s"}: ${w.rows.slice(0, 8).join(", ")}${w.rows.length > 8 ? ", …" : ""})` : ""}
                  </li>
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
          {!hasTransactions && read.sheets.settings ? (
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[var(--accent)]" />
              <span>
                Replace the default categories with the ones from this workbook
                <span className="block text-xs text-muted">Recommended for a fresh account</span>
              </span>
            </label>
          ) : null}

          {payloadTooBig ? <p role="alert" className="rounded-inset bg-bad/10 px-4 py-3 text-sm text-bad">This import is too large to send in one go. Split the file into smaller files and import them one at a time</p> : null}
          {report.stats.transactions === 0 ? <p className="text-sm text-muted">Nothing to import. Check the detected settings and columns above</p> : null}
          {blocked ? <p className="text-xs text-warn">{blocked}</p> : null}
          <Button size="lg" className="w-full" onClick={doImport} disabled={pending || Boolean(blocked) || payloadTooBig || report.stats.transactions === 0}>
            {pending ? "Importing…" : `Import ${report.stats.transactions} transactions`}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
