import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { HELP } from "@/lib/help";

export type SettleRowView = {
  id: string;
  name: string;
  initials: string;
  color: number;
  sentence: string;
  /** "good" when they owe you, otherwise neutral. */
  tone: "owe" | "owed" | "settled";
  /** Formatted absolute net. */
  net: string;
  youPaid: string;
  theyPaid: string;
  /** 0..1 of the widest bar. */
  youShare: number;
  theyShare: number;
};

const chip = "grid size-9 shrink-0 place-items-center rounded-full text-xs font-medium ring-2 ring-surface";

function Avatar({ initials, color }: { initials: string; color: number | null }) {
  return (
    <span
      aria-hidden
      className={cn(chip, color == null && "bg-surface-3 text-muted")}
      style={color == null ? undefined : { background: `color-mix(in srgb, var(--c${color}) 25%, var(--surface))`, color: `color-mix(in srgb, var(--c${color}) 55%, var(--text))` }}
    >
      {initials}
    </span>
  );
}

/** Who paid for what, per person: a centred bar with you on the left and them on the right, and the net in plain words. Assumptions live in lib/analytics/settle-up.ts. */
export function SettleUpCard({ rows, youInitials, summary, basis }: { rows: SettleRowView[]; youInitials: string; summary: string; basis: string }) {
  return (
    <Card>
      <CardHeader title="Settle up" subtitle={basis} info={HELP.settleUp} />
      {rows.length ? (
        <>
          <p className="mb-2 text-sm font-medium">{summary}</p>
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 py-3">
                <span className="flex items-center -space-x-2">
                  <Avatar initials={youInitials} color={null} />
                  <Avatar initials={r.initials} color={r.color} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.sentence}</p>
                  <div role="img" aria-label={`You paid ${r.youPaid}, ${r.name} paid ${r.theyPaid}`} className="mt-2 grid grid-cols-2">
                    <span className="flex justify-end border-r border-text/30 pr-px">
                      <span className="h-2 rounded-l-inset bg-(--chart-n2)" style={{ width: `${Math.round(r.youShare * 100)}%` }} />
                    </span>
                    <span className="flex justify-start pl-px">
                      <span className="h-2 rounded-r-inset bg-accent" style={{ width: `${Math.round(r.theyShare * 100)}%` }} />
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between gap-3 text-xs text-muted">
                    <span className="truncate">You paid <span className="money">{r.youPaid}</span></span>
                    <span className="truncate text-right">{r.name} paid <span className="money">{r.theyPaid}</span></span>
                  </div>
                </div>
                <p className={cn("money text-right text-sm font-medium", r.tone === "owed" && "text-good", r.tone === "settled" && "text-muted")}>{r.tone === "owed" ? "+" : r.tone === "owe" ? "−" : ""}{r.net}</p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="py-6 text-center text-sm text-muted">Nobody else has paid for anything yet. Set Paid by on a transaction to someone else and the balance shows up here.</p>
      )}
    </Card>
  );
}
