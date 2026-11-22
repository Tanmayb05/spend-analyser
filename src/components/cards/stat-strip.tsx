import { cn } from "@/lib/utils";

export type Stat = { label: string; value: string; /** Kept for callers: display figures are all set tabular (num-lg), mono is for table rows only. */ money?: boolean; /** small line under the figure, e.g. a comparison */ note?: string; noteTone?: "good" | "bad" };

/** One ruled strip of figures: label over figure, hairline between cells. Replaces a row of separate stat cards. */
export function StatStrip({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <section className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border lg:grid-cols-4", className)}>
      {stats.map((s) => (
        <div key={s.label} className="min-w-0 bg-surface p-compact sm:p-card">
          <p className="text-label text-muted">{s.label}</p>
          <p className="num-lg mt-2 break-words text-xl font-medium sm:text-2xl">{s.value}</p>
          {s.note ? <p className={cn("mt-1 text-xs text-muted", s.noteTone === "good" && "text-good", s.noteTone === "bad" && "text-bad")}>{s.note}</p> : null}
        </div>
      ))}
    </section>
  );
}
