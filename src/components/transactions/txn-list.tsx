"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckSquare, Square, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LedgerItem } from "./ledger-item";
import { useAppData } from "@/components/app-data";
import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { deleteTransactions, restoreTransactions } from "@/app/(app)/transactions/actions";
import type { LedgerRow } from "@/lib/data/types";

/** Day-grouped list with select mode + bulk delete (with undo). */
export function TxnList({ rows }: { rows: LedgerRow[] }) {
  const app = useAppData();
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const days = new Map<string, LedgerRow[]>();
  for (const r of rows) {
    const l = days.get(r.entry_date) ?? [];
    l.push(r);
    days.set(r.entry_date, l);
  }

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
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm text-muted">{rows.length} {rows.length === 1 ? "entry" : "entries"}</p>
        {selecting ? (
          <div className="flex items-center gap-2">
            <Button variant="danger" size="sm" disabled={!picked.size || pending} onClick={bulkDelete}>
              <Trash2 size={14} /> Delete {picked.size || ""}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setSelecting(false); setPicked(new Set()); }} aria-label="Cancel selection">
              <X size={16} />
            </Button>
          </div>
        ) : rows.length ? (
          <Button variant="ghost" size="sm" onClick={() => setSelecting(true)}>
            <CheckSquare size={14} /> Select
          </Button>
        ) : null}
      </div>

      {[...days.entries()].map(([day, list]) => {
        const total = list.reduce((a, r) => a + Number(r.spend), 0);
        return (
          <section key={day} className="mb-3">
            <div className="flex items-center justify-between px-2 py-2 text-xs text-muted">
              <span className="font-medium">{formatDay(day)}</span>
              {total ? <span className="num">{formatMoney(-total, app.currency, { signed: true })}</span> : null}
            </div>
            <div className="-mx-2 rounded-3xl">
              {list.map((r, i) => {
                const k = `${r.txn_id ?? r.trip_id}-${r.installment_seq ?? 0}-${i}`;
                if (!selecting) return <LedgerItem key={k} row={r} showDate={false} />;
                const on = r.txn_id ? picked.has(r.txn_id) : false;
                return (
                  <div key={k} className={cn("flex items-center gap-1 rounded-2xl", on && "bg-accent/10")}>
                    <button type="button" disabled={!r.txn_id} onClick={() => toggle(r.txn_id)} className="grid h-11 w-11 shrink-0 place-items-center text-muted" aria-label={on ? "Deselect" : "Select"}>
                      {on ? <CheckSquare size={20} className="text-accent" /> : <Square size={20} />}
                    </button>
                    <div className="min-w-0 flex-1" onClickCapture={(e) => { e.stopPropagation(); e.preventDefault(); toggle(r.txn_id); }}>
                      <LedgerItem row={r} showDate={false} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
