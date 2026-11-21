import { ChevronDown, Download } from "lucide-react";
import { CLEAN_CHECKLIST, COLUMN_GUIDE } from "@/lib/import/template";

const STEPS = [
  { title: "Clean your file", desc: "Match the sample's columns and formats." },
  { title: "Choose it", desc: "Pick the .xlsx or .csv below." },
  { title: "Review the preview", desc: "Totals, EMI plans and skipped rows show first." },
  { title: "Confirm", desc: "Nothing is saved until you press Import." },
];

const SAMPLES = [
  { href: "/api/import-template?format=xlsx", label: "Sample (.xlsx)", desc: "Example rows plus a How to fill sheet" },
  { href: "/api/import-template?format=csv", label: "Sample (.csv)", desc: "Same rows, for any spreadsheet" },
];

/** How import works: steps, sample download, column guide and a clean-up checklist. */
export function ImportGuide() {
  return (
    <details open className="group mb-4 rounded-card border border-border bg-surface-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-compact font-medium">
        How import works
        <ChevronDown size={16} aria-hidden className="text-muted transition-transform duration-[var(--dur-base)] group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-5 border-t border-border p-compact">
        <ol className="grid gap-3 sm:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                <span className="num text-muted">{i + 1}.</span> {s.title}
              </span>
              <span className="text-xs text-muted">{s.desc}</span>
            </li>
          ))}
        </ol>

        <ul className="grid gap-2 sm:grid-cols-2">
          {SAMPLES.map((s) => (
            <li key={s.href}>
              <a href={s.href} download className="flex h-full flex-col gap-1 rounded-control border border-border bg-surface p-compact transition-colors hover:bg-surface-3">
                <span className="flex items-center gap-2 font-medium">
                  <Download size={16} /> {s.label}
                </span>
                <span className="text-xs text-muted">{s.desc}</span>
              </a>
            </li>
          ))}
        </ul>

        <div>
          <h3 className="mb-2 text-label font-medium">Clean before you import</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {CLEAN_CHECKLIST.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-2 text-label font-medium">Columns</h3>
          <div className="overflow-x-auto rounded-inset border border-border bg-surface">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 font-medium">Column</th>
                  <th className="px-3 py-2 font-medium">Needed</th>
                  <th className="px-3 py-2 font-medium">What it accepts</th>
                  <th className="px-3 py-2 font-medium">Example</th>
                </tr>
              </thead>
              <tbody>
                {COLUMN_GUIDE.map((g) => (
                  <tr key={g.column} className="border-b border-border last:border-b-0 align-top">
                    <td className="px-3 py-2 font-medium">{g.column}</td>
                    <td className={g.required === "required" ? "px-3 py-2 text-text" : "px-3 py-2 text-muted"}>{g.required}</td>
                    <td className="px-3 py-2 text-muted">{g.accepts}</td>
                    <td className="px-3 py-2 text-muted">{g.example || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </details>
  );
}
