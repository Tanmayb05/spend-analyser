"use client";

import Link from "next/link";
import { ExternalLink, Pencil } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/components/app-data";
import { categoryColor } from "@/components/charts/colors";
import { formatMoney } from "@/lib/money";
import { formatDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { LedgerRowWithLink } from "./ledger-item";

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-sm">{children}</dd>
    </div>
  );
}

/** Read-only view of one ledger row. "Edit" hands over to the transaction form. */
export function TxnDetail({ row, onClose }: { row: LedgerRowWithLink | null; onClose: () => void }) {
  const app = useAppData();
  const cat = row ? app.maps.category.get(row.category_id) : undefined;
  const sub = row?.subcategory_id ? app.maps.subcategory.get(row.subcategory_id) : null;
  const trip = row?.trip_id ? app.maps.trip.get(row.trip_id) : null;
  const pay = row?.payment_method_id ? app.maps.payment.get(row.payment_method_id) : null;
  const by = row?.paid_by_id ? app.maps.person.get(row.paid_by_id) : null;
  const income = row?.type === "income" || row?.type === "refund";
  const foreign = row?.orig_currency && row.orig_currency !== app.currency;
  const title = row ? row.merchant_name || row.description || sub?.name || cat?.name || "Transaction" : "";

  return (
    <Sheet open={Boolean(row)} onClose={onClose} title="Transaction">
      {row ? (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted">{title}</p>
            <p className={cn("num mt-1 text-3xl font-medium", income && "text-good")}>
              {formatMoney(income ? Math.abs(Number(row.amount)) : -Math.abs(Number(row.amount)), app.currency, { signed: true })}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {row.is_scheduled ? <Badge tone="warn">Scheduled</Badge> : <Badge tone="good">Posted</Badge>}
              {row.installment_seq ? <Badge tone={row.plan_kind === "emi" ? "warn" : "accent"}>{row.plan_kind === "emi" ? "EMI" : "Spread"} {row.installment_seq}/{row.installment_count}</Badge> : null}
              {trip ? <Badge>{trip.name}</Badge> : null}
            </div>
          </div>

          <dl className="divide-y divide-border">
            <Item label="Date">{formatDay(row.entry_date)}</Item>
            <Item label="Category">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: categoryColor(cat) }} />
                {sub ? `${cat?.name} › ${sub.name}` : cat?.name}
              </span>
            </Item>
            {row.merchant_name ? <Item label="Merchant">{row.merchant_name}</Item> : null}
            {row.description ? <Item label="Description">{row.description}</Item> : null}
            {pay ? <Item label="Account">{pay.name}</Item> : null}
            {by ? <Item label="Paid by">{by.name}</Item> : null}
            {foreign ? <Item label="Original amount">{formatMoney(Number(row.orig_amount), row.orig_currency!)}</Item> : null}
            {row.installment_seq && row.txn_id ? (
              <Item label="Plan">
                <Link href={`/transactions?tab=plans#plan-${row.txn_id}`} className="text-accent hover:underline">
                  Payment {row.installment_seq} of {row.installment_count} · view plan
                </Link>
              </Item>
            ) : null}
            {row.external_url ? (
              <Item label="Link">
                <a href={row.external_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                  Open <ExternalLink size={12} />
                </a>
              </Item>
            ) : null}
            {row.notes ? <Item label="Notes"><span className="whitespace-pre-wrap">{row.notes}</span></Item> : null}
          </dl>

          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={onClose}>Close</Button>
            <Button
              className="flex-1"
              onClick={() => {
                const id = row.txn_id;
                onClose();
                if (id) app.openTxnSheet({ id });
              }}
            >
              <Pencil size={16} /> Edit
            </Button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
