"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, Pencil } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/components/app-data";
import { CardBadge } from "@/components/cards/card-badge";
import { MiniCard } from "@/components/cards/mini-card";
import { TransactionReceipt } from "@/components/receipts/transaction-receipt";
import { TxnContextStrip } from "./txn-context-strip";
import { DeleteTxnButton } from "./delete-txn-button";
import { categoryColor } from "@/components/charts/colors";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/money";
import { formatDay } from "@/lib/dates";
import { monogram } from "@/lib/monogram";
import { packFields, WIDE_TEXT, type GridField } from "@/lib/detail-grid";
import { isCardKind, kindMeta } from "@/lib/payment-kinds";
import { cn } from "@/lib/utils";
import type { LedgerRowWithLink } from "./ledger-item";

/** One field of the detail grid. Cells sit on hairlines (the grid's gap shows the border colour), so there are no boxes inside boxes. */
export function Cell({ label, children, span }: { label: string; children: React.ReactNode; span: 1 | 2 }) {
  return (
    <div className={cn("min-w-0 bg-surface-2 px-3 py-2.5", span === 2 && "col-span-2")}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 min-w-0 break-words text-sm leading-5">{children}</dd>
    </div>
  );
}

/** Last 4 digits saved for a card, read when the sheet opens. The number itself is never stored. */
function useLast4(paymentId: string | null | undefined, enabled: boolean) {
  const [value, setValue] = useState<{ id: string; last4: string | null } | null>(null);
  useEffect(() => {
    if (!paymentId || !enabled) return;
    let live = true;
    (async () => {
      const { data } = await createClient().from("payment_method_cards").select("last4").eq("payment_method_id", paymentId).order("created_at").limit(1);
      if (live) setValue({ id: paymentId, last4: data?.[0]?.last4 ?? null });
    })();
    return () => {
      live = false;
    };
  }, [paymentId, enabled]);
  return value && value.id === paymentId ? value.last4 : null;
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
  const isCard = pay ? isCardKind(kindMeta(pay.kind).value) : false;
  const last4 = useLast4(pay?.id, isCard);
  // the type is shown only when the name does not already say it, with the last 4 when saved
  const kindLabel = pay ? kindMeta(pay.kind).label : "";
  const accountNote = pay ? [pay.name.trim().toLowerCase() === kindLabel.toLowerCase() ? null : kindLabel, isCard && last4 ? `ending ${last4}` : null].filter(Boolean).join(" · ") : "";
  // a single entry with a merchant can be compared with earlier ones; plan payments and trip lump sums cannot
  const compare = Boolean(row && row.txn_id && row.merchant_id && row.merchant_name && !row.installment_seq && !row.is_lump);

  // fields in reading order; packFields decides which share a row so the grid never has a hole
  const fields: (GridField & { label: string; node: React.ReactNode })[] = [];
  if (row) {
    fields.push({ key: "date", label: "Date", node: formatDay(row.entry_date) });
    if (by)
      fields.push({
        key: "by",
        label: "Paid by",
        node: (
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="grid size-5 place-items-center rounded-full bg-surface-3 text-xs font-medium">{monogram(by.name)}</span>
            {by.name}
          </span>
        ),
      });
    if (pay)
      fields.push({
        key: "account",
        label: "Account",
        wide: true,
        node: (
          <span className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-3">
              {isCard && (pay.network || last4) ? (
                <MiniCard color={pay.color} network={pay.network} last4={last4} />
              ) : (
                <CardBadge kind={pay.kind} issuer={pay.issuer} nickname={pay.nickname} name={pay.name} color={pay.color} />
              )}
              <span className="truncate">{pay.name}</span>
            </span>
            {accountNote ? <span className="money shrink-0 text-xs text-muted">{accountNote}</span> : null}
          </span>
        ),
      });
    if (row.description) fields.push({ key: "desc", label: "Description", wide: row.description.length > WIDE_TEXT, node: row.description });
    if (foreign) fields.push({ key: "orig", label: "Original amount", node: formatMoney(Number(row.orig_amount), row.orig_currency!) });
    if (row.installment_seq && row.txn_id)
      fields.push({
        key: "plan",
        label: "Plan",
        wide: true,
        node: (
          <Link href={`/transactions?tab=plans#plan-${row.txn_id}`} className="text-accent hover:underline">
            Payment {row.installment_seq} of {row.installment_count} · view plan
          </Link>
        ),
      });
    if (row.external_url)
      fields.push({
        key: "link",
        label: "Link",
        node: (
          <a href={row.external_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
            Open <ExternalLink size={14} />
          </a>
        ),
      });
    if (row.notes) fields.push({ key: "notes", label: "Notes", wide: true, node: <span className="whitespace-pre-wrap">{row.notes}</span> });
  }
  const spans = new Map(packFields(fields).map((f) => [f.key, f.span]));

  return (
    <Sheet open={Boolean(row)} onClose={onClose} title="Transaction" className="sm:max-w-xl">
      {row ? (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden
                className="grid size-10 shrink-0 place-items-center rounded-full border border-border text-sm font-medium"
                style={{ background: `color-mix(in srgb, ${categoryColor(cat)} 24%, var(--surface-3))` }}
              >
                {monogram(row.merchant_name || title)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-medium">{title}</p>
                <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: categoryColor(cat) }} aria-hidden />
                  <span className="truncate">{sub ? `${cat?.name} › ${sub.name}` : cat?.name}</span>
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className={cn("num-lg text-2xl font-medium", income && "text-good")}>
                {formatMoney(income ? Math.abs(Number(row.amount)) : -Math.abs(Number(row.amount)), app.currency, { signed: true })}
              </p>
              <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
                {row.is_scheduled ? <Badge tone="warn">Scheduled</Badge> : <Badge tone="good">Posted</Badge>}
                {row.installment_seq ? <Badge tone={row.plan_kind === "emi" ? "warn" : "accent"}>{row.plan_kind === "emi" ? "EMI" : "Spread"} {row.installment_seq}/{row.installment_count}</Badge> : null}
                {trip ? <Badge>{trip.name}</Badge> : null}
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-control border border-border bg-border">
            {fields.map((f) => (
              <Cell key={f.key} label={f.label} span={spans.get(f.key) ?? 1}>
                {f.node}
              </Cell>
            ))}
          </dl>

          {compare ? (
            <TxnContextStrip key={row.txn_id} txnId={row.txn_id!} type={row.type} merchantId={row.merchant_id} merchant={row.merchant_name} amount={Number(row.amount)} date={row.entry_date} currency={app.currency} />
          ) : null}

          {row.receipt_id && row.txn_id ? <TransactionReceipt key={row.txn_id} receiptId={row.receipt_id} txnId={row.txn_id} currency={app.currency} onUnlinked={onClose} /> : null}

          <div className="flex gap-2">
            {/* an installment row belongs to a plan: deleting it removes the whole plan and its schedule */}
            {row.txn_id ? <DeleteTxnButton txnId={row.txn_id} what={row.installment_seq ? "plan" : "transaction"} onDeleted={onClose} /> : null}
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
