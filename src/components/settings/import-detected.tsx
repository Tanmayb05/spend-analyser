"use client";

import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/field";
import type { FileMeta } from "@/lib/import/read-file";
import { FIELD_LABELS, type ColumnMap, type Detected, type DateOrder, type DecimalMark, type FieldKey, type SignMode } from "@/lib/import/workbook";

export type ImportOptions = {
  dateOrder?: DateOrder;
  decimalMark?: DecimalMark;
  signMode?: SignMode;
  columns?: Partial<ColumnMap>;
};

const DELIMITER_NAMES: Record<string, string> = { ",": "comma-separated", ";": "semicolon-separated", "\t": "tab-separated", "|": "pipe-separated" };

const COLUMN_FIELDS: FieldKey[] = ["date", "amount", "debit", "credit", "type", "category", "subcategory", "merchant", "description", "currency", "payment", "paidBy", "trip", "notes"];

/** "A", "B", … "AA" for headers that are blank in the file. */
function columnLetter(i: number): string {
  let s = "";
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s;
  return s;
}

function Row({ label, hint, tone, children }: { label: string; hint?: string; tone?: "warn"; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className={tone === "warn" ? "text-xs text-warn" : "text-xs text-muted"}>{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** What the importer worked out about the file, with controls to correct it. */
export function ImportDetected({ detected, needsInput, options, onChange, meta }: { detected: Detected; needsInput: string[]; options: ImportOptions; onChange: (o: ImportOptions) => void; meta: FileMeta }) {
  const d = detected;
  const col = (f: FieldKey) => d.columns[f];
  const setColumn = (f: FieldKey, idx: number) => onChange({ ...options, columns: { ...options.columns, [f]: idx } });
  const mapped = COLUMN_FIELDS.filter((f) => col(f) >= 0).length;
  const fileLine = [meta.kind === "csv" ? `${meta.encoding ?? "UTF-8"}, ${DELIMITER_NAMES[meta.delimiter ?? ","] ?? "delimited"}` : `Sheet ${meta.sheet ?? ""}`, `header on row ${d.headerRow}`].join(", ");

  const dateHint =
    d.dateOrder.state === "ambiguous"
      ? "Every date in this file fits both orders. Pick the right one"
      : d.dateOrder.state === "mixed"
        ? "This file uses both orders. Rows that don't fit your choice are skipped"
        : d.dateOrder.state === "known"
          ? "Read from the dates in the file"
          : "You chose this";
  const decHint = d.decimalMark.state === "conflict" ? "Amounts use both marks. Pick the right one" : d.decimalMark.state === "chosen" ? "You chose this" : "Read from the amounts in the file";

  return (
    <section aria-label="What we detected" className="rounded-card border border-border bg-surface-2 px-compact">
      <h3 className="pt-3 text-label font-medium">What we detected</h3>
      <Row label="File" hint={fileLine}>
        <span className="text-sm text-muted">{d.amountStyle === "split" ? "Separate debit and credit columns" : "One amount column"}</span>
      </Row>

      {d.dateOrder.state !== "none" ? (
        <Row label="Date order" hint={dateHint} tone={needsInput.includes("dateOrder") || d.dateOrder.state === "mixed" ? "warn" : undefined}>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Segmented
              ariaLabel="Date order"
              size="sm"
              value={d.dateOrder.value}
              onChange={(v) => onChange({ ...options, dateOrder: v })}
              options={[
                { value: "dmy", label: "Day first" },
                { value: "mdy", label: "Month first" },
              ]}
            />
            {d.dateOrder.samples.length ? (
              <p className="num text-xs text-muted">{d.dateOrder.samples.map((s) => `${s.raw} → ${s.iso ?? "invalid"}`).join("  ·  ")}</p>
            ) : null}
          </div>
        </Row>
      ) : null}

      {d.decimalMark.state !== "none" ? (
        <Row label="Decimal mark" hint={decHint} tone={needsInput.includes("decimalMark") ? "warn" : undefined}>
          <Segmented
            ariaLabel="Decimal mark"
            size="sm"
            value={d.decimalMark.value}
            onChange={(v) => onChange({ ...options, decimalMark: v })}
            options={[
              { value: ".", label: "1,234.50" },
              { value: ",", label: "1.234,50" },
            ]}
          />
        </Row>
      ) : null}

      {d.amountStyle === "single" && d.signMode.source !== "type" ? (
        <Row label="Negative amounts" hint={d.signMode.source === "inferred" ? "Guessed from the signs in the file" : "You chose this"}>
          <Segmented
            ariaLabel="Meaning of negative amounts"
            size="sm"
            value={d.signMode.value}
            onChange={(v) => onChange({ ...options, signMode: v })}
            options={[
              { value: "bank", label: "Are spending" },
              { value: "positive-spend", label: "Are refunds" },
            ]}
          />
        </Row>
      ) : null}

      <details className="border-t border-border py-3">
        <summary className="cursor-pointer text-sm font-medium">
          Columns <span className="font-normal text-muted">({mapped} matched)</span>
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {COLUMN_FIELDS.map((f) => (
            <label key={f} className="flex flex-col gap-1 text-xs text-muted">
              {FIELD_LABELS[f]}
              <Select value={col(f)} onChange={(e) => setColumn(f, Number(e.target.value))} className="h-10 text-sm">
                <option value={-1}>Not in the file</option>
                {d.headers.map((h, i) => (h || i === col(f) ? <option key={i} value={i}>{h || `Column ${columnLetter(i)}`}</option> : null))}
              </Select>
            </label>
          ))}
        </div>
      </details>
    </section>
  );
}
