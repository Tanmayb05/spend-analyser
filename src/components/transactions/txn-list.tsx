"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckSquare, Square, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LedgerItem, type LedgerRowWithLink } from "./ledger-item";
import { TxnDetail } from "./txn-detail";
import { useBackSheet } from "@/hooks/use-back-nav";
import { useAppData } from "@/components/app-data";
import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { TxnSort } from "@/lib/analytics/filters";
import { deleteTransactions, restoreTransactions } from "@/app/(app)/transactions/actions";
import type { LedgerRow } from "@/lib/data/types";

type Group = { key: string; title: string; note: string; rows: LedgerRow[]; showDate: boolean; upcoming?: boolean };

/** Day groups (newest or oldest first), or one flat "largest first" group. */
export function groupRows(rows: LedgerRow[], sort: TxnSort): { key: string; day: string | null; rows: LedgerRow[] }[] {
  if (sort === "largest") {
    return rows.length ? [{ key: "largest", day: null, rows: [...rows].sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount))) }] : [];
  }
  const days = new Map<string, LedgerRow[]>();
  for (const r of rows) {
    const l = days.get(r.entry_date) ?? [];
    l.push(r);
    days.set(r.entry_date, l);
  }
  return [...days.entries()]
    .sort(([a], [b]) => (sort === "oldest" ? (a < b ? -1 : 1) : a < b ? 1 : -1))
    .map(([day, list]) => ({ key: day, day, rows: list }));
}

/** "$420 spent" / "$6,650 received" for a day's rows (spent wins when both). */
export function dayNote(rows: LedgerRow[], currency: string): string {
  const spent = rows.reduce((a, r) => a + Number(r.spend), 0);
  const income = rows.reduce((a, r) => a + Number(r.income), 0);
  if (spent > 0) return `${formatMoney(spent, currency, { whole: spent >= 1000 })} spent`;
  if (income > 0) return `${formatMoney(income, currency, { whole: income >= 1000 })} received`;
  return "";
}

/** Day-grouped list with select mode + bulk delete (with undo). Scheduled rows sit in their own "Upcoming" group. */
export function TxnList({ rows, upcoming = [], sort = "newest" }: { rows: LedgerRow[]; upcoming?: LedgerRow[]; sort?: TxnSort }) {
  const app = useAppData();
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const detail = useBackSheet<LedgerRowWithLink>(); // Back closes the detail sheet

  const groups: Group[] = groupRows(rows, sort).map((g) => ({
    key: g.key,
    title: g.day ? formatDay(g.day) : "Largest first",
    note: g.day ? dayNote(g.rows, app.currency) : "",
    rows: g.rows,
    showDate: !g.day,
  }));
  if (upcoming.length) {
    const sum = upcoming.reduce((a, r) => a + Number(r.spend) - Number(r.income), 0);
    const newestFirst = sort === "newest";
    // newest-first: upcoming sits on top, furthest date first; other sorts keep it at the end, soonest first
    groups[newestFirst ? "unshift" : "push"]({
      key: "upcoming",
      title: "Upcoming",
      note: `${upcoming.length} scheduled · ${formatMoney(Math.abs(sum), app.currency, { whole: Math.abs(sum) >= 1000 })}${sum < 0 ? " in" : ""}`,
      rows: [...upcoming].sort((a, b) => ((a.entry_date < b.entry_date ? -1 : 1) * (newestFirst ? -1 : 1))),
      showDate: true,
      upcoming: true,
    });
  }
  const count = rows.length + upcoming.length;

  const toggle = (id: string | null) => {
    if (!id) return;
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  function bulkDelete() {
    const ids = [...picked];
    start(async () => {
      const res = await deleteTransactions(ids);
      if (!res.ok) return void toast.error(res.error);
      setPicked(new Set());
      setSelecting(false);
      router.refresh();
      toast(`Deleted ${ids.length} ${ids.length === 1 ? "transaction" : "transactions"}`, {
        action: {
          label: "Undo",
          onClick: async () => {
            const r = await restoreTransactions(res.data);
            if (r.ok) router.refresh();
            else toast.error(r.error);
          },
        },
      });
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="num text-sm text-muted">{count} {count === 1 ? "entry" : "entries"}</p>
        {selecting ? (
          <Button variant="ghost" size="sm" onClick={() => { setSelecting(false); setPicked(new Set()); }}>
            Cancel
          </Button>
        ) : count ? (
          <Button variant="ghost" size="sm" onClick={() => setSelecting(true)}>
            <CheckSquare size={16} /> Select
          </Button>
        ) : null}
      </div>

      {groups.map((g) => (
        <section key={g.key} aria-label={g.upcoming ? "Upcoming scheduled" : undefined} className={cn("mb-4", g.upcoming && "mt-1 rounded-card border border-dashed border-border p-2")}>
          <div className="flex items-center justify-between gap-3 px-2 py-2 text-label text-muted">
            <span className={cn(g.upcoming && "text-warn")}>{g.title}</span>
            {g.note ? <span className="num">{g.upcoming ? g.note : `· ${g.note}`}</span> : null}
          </div>
          <div className="-mx-2 divide-y divide-border border-t border-border">
            {g.rows.map((r, i) => {
              const k = `${r.txn_id ?? r.trip_id}-${r.installment_seq ?? 0}-${i}`;
              if (!selecting) return <LedgerItem key={k} row={r} showDate={g.showDate} onOpen={detail.show} />;
              const on = r.txn_id ? picked.has(r.txn_id) : false;
              return (
                <div key={k} className={cn("flex items-center gap-1 rounded-control", on && "bg-surface-3 ring-1 ring-inset ring-accent")}>
                  <button type="button" disabled={!r.txn_id} onClick={() => toggle(r.txn_id)} className="grid h-11 w-11 shrink-0 place-items-center text-muted" aria-label={on ? "Deselect" : "Select"}>
                    {on ? <CheckSquare size={18} className="text-accent" /> : <Square size={18} />}
                  </button>
                  <div className="min-w-0 flex-1" onClickCapture={(e) => { e.stopPropagation(); e.preventDefault(); toggle(r.txn_id); }}>
                    <LedgerItem row={r} showDate={g.showDate} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <TxnDetail row={detail.value} onClose={detail.hide} />

      {selecting ? (
        <div role="toolbar" aria-label="Bulk actions" className="sticky bottom-24 z-30 mt-3 flex items-center justify-between gap-3 rounded-card border border-border bg-surface-3 p-3 shadow-pop lg:bottom-4">
          <span className="text-sm text-muted">{picked.size ? `${picked.size} selected` : "Pick entries to delete"}</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setSelecting(false); setPicked(new Set()); }} aria-label="Cancel selection">
              <X size={16} />
            </Button>
            <Button variant="danger" size="sm" disabled={!picked.size || pending} onClick={bulkDelete}>
              <Trash2 size={16} /> Delete {picked.size || ""}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
