"use client";

import { LedgerItem } from "./ledger-item";
import type { LedgerRow } from "@/lib/data/types";

export function LedgerList({ rows, showDate = true, empty }: { rows: LedgerRow[]; showDate?: boolean; empty?: React.ReactNode }) {
  if (!rows.length) return <>{empty ?? <p className="py-6 text-center text-sm text-muted">Nothing here yet.</p>}</>;
  return (
    <div className="-mx-2">
      {rows.map((r, i) => (
        <LedgerItem key={`${r.txn_id ?? r.trip_id}-${r.installment_seq ?? 0}-${r.entry_date}-${i}`} row={r} showDate={showDate} />
      ))}
    </div>
  );
}
