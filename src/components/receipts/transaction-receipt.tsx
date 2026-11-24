"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ExternalLink, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { barcodeBars } from "@/lib/barcode";
import { formatDay } from "@/lib/dates";
import { unlinkReceiptAction } from "@/app/(app)/receipts/actions";

type Receipt = {
  merchant_name: string | null;
  purchased_at: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  fees: number | null;
  tip: number | null;
  total: number | null;
  card_last4: string | null;
  card_brand: string | null;
  label: string | null;
  match_complete: boolean;
};
type Item = { id: string; line_no: number; raw_name: string; normalized_name: string | null; quantity: number | null; total_price: number | null };
type Page = { page_no: number; storage_path: string };

/** Torn paper edge: a row of triangles in the paper colour with a hairline along the teeth. `flip` draws it for the bottom edge. */
function ZigEdge({ flip }: { flip?: boolean }) {
  const w = 12;
  const h = 6;
  return (
    <svg aria-hidden width="100%" height={h} className={cn("block text-surface-2", flip && "rotate-180")}>
      <defs>
        <pattern id={flip ? "zig-b" : "zig-t"} width={w} height={h} patternUnits="userSpaceOnUse">
          <polygon points={`0,${h} ${w / 2},0 ${w},${h}`} fill="currentColor" />
          <polyline points={`0,${h} ${w / 2},0.5 ${w},${h}`} fill="none" stroke="var(--border)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height={h} fill={`url(#${flip ? "zig-b" : "zig-t"})`} />
    </svg>
  );
}

/** A line of the paper: label, dotted leader, then the figure. */
function Line({ label, value, strong }: { label: React.ReactNode; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline gap-2", strong && "font-medium")}>
      <span className="min-w-0 truncate">{label}</span>
      <span aria-hidden className="mb-1 min-w-4 flex-1 border-b border-dotted border-text/25" />
      <span className="money shrink-0">{value}</span>
    </div>
  );
}

/** Receipt details for a transaction, read live from the receipt tables (nothing is copied into the transaction). */
export function TransactionReceipt({ receiptId, txnId, currency, onUnlinked }: { receiptId: string; txnId: string; currency: string; onUnlinked: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<{ receipt: Receipt; items: Item[]; urls: (string | null)[]; others: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    (async () => {
      const supabase = createClient();
      const [r, items, pages, count] = await Promise.all([
        supabase.from("receipts").select("merchant_name, purchased_at, currency, subtotal, tax, fees, tip, total, card_last4, card_brand, label, match_complete").eq("id", receiptId).maybeSingle(),
        supabase.from("receipt_items").select("id, line_no, raw_name, normalized_name, quantity, total_price").eq("receipt_id", receiptId).order("line_no"),
        supabase.from("receipt_pages").select("page_no, storage_path").eq("receipt_id", receiptId).order("page_no"),
        supabase.from("transactions").select("id", { count: "exact", head: true }).eq("receipt_id", receiptId).neq("id", txnId),
      ]);
      if (!live || !r.data) return;
      const urls = await Promise.all(((pages.data ?? []) as Page[]).map(async (p) => (await supabase.storage.from("receipts").createSignedUrl(p.storage_path, 3600)).data?.signedUrl ?? null));
      if (live) setData({ receipt: r.data as Receipt, items: (items.data ?? []) as Item[], urls, others: count.count ?? 0 });
    })();
    return () => {
      live = false;
    };
  }, [receiptId, txnId]);

  if (!data) return null;
  const { receipt: r, items, urls, others } = data;
  const cur = r.currency?.trim() || currency;

  function unlink() {
    start(async () => {
      const res = await unlinkReceiptAction(txnId);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Receipt unlinked and moved to the inbox");
      onUnlinked();
      router.refresh();
    });
  }

  return (
    <section className="rounded-control border border-border" aria-label="Receipt">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left">
        <span className="min-w-0">
          <span className="block text-sm font-medium">Receipt{r.label ? ` · ${r.label}` : ""}</span>
          <span className="block truncate text-xs text-muted">
            {r.merchant_name ?? "Unknown merchant"} · {items.length} item{items.length === 1 ? "" : "s"}
            {r.card_last4 ? ` · ${r.card_brand ?? "Card"} ${r.card_last4}` : ""}
            {others ? ` · shared with ${others} other transaction${others === 1 ? "" : "s"}` : ""}
          </span>
        </span>
        <ChevronDown size={18} className={cn("shrink-0 text-muted transition-transform duration-(--dur-fast)", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="space-y-3 border-t border-border px-3 py-3">
          {/* the receipt as thermal paper */}
          <div className="mx-auto w-full max-w-sm">
            <ZigEdge />
            <div className="bg-surface-2 px-5 py-3 font-mono text-xs text-text">
              <div className="text-center">
                <p className="text-sm font-medium">{r.merchant_name ?? "Unknown merchant"}</p>
                <p className="mt-1 text-muted">
                  {r.purchased_at ? formatDay(r.purchased_at) : "No date"}
                  {r.label ? ` · ${r.label}` : ""}
                </p>
              </div>
              <hr className="my-3 border-t border-dashed border-text/25" />
              {items.length ? (
                <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                  {items.map((i) => (
                    <li key={i.id}>
                      <Line
                        label={
                          <>
                            {i.quantity && i.quantity !== 1 ? <span className="text-muted">{i.quantity} × </span> : null}
                            {i.normalized_name || i.raw_name}
                          </>
                        }
                        value={i.total_price != null ? i.total_price.toFixed(2) : ""}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-center text-muted">No line items</p>
              )}
              <hr className="my-3 border-t border-dashed border-text/25" />
              <div className="space-y-1.5">
                {r.subtotal != null ? <Line label="Subtotal" value={formatMoney(r.subtotal, cur)} /> : null}
                {r.fees ? <Line label="Fees" value={formatMoney(r.fees, cur)} /> : null}
                {r.tax ? <Line label="Tax" value={formatMoney(r.tax, cur)} /> : null}
                {r.tip ? <Line label="Tip" value={formatMoney(r.tip, cur)} /> : null}
                {r.total != null ? <Line strong label="Total" value={formatMoney(r.total, cur)} /> : null}
              </div>
              {r.card_last4 ? <p className="mt-3 text-muted">{r.card_brand ?? "Card"} ending {r.card_last4}</p> : null}
              {others ? <p className="mt-1 text-muted">Shared with {others} other transaction{others === 1 ? "" : "s"}</p> : null}
              <svg aria-hidden viewBox="0 0 160 24" preserveAspectRatio="none" className="mt-4 h-8 w-full text-text/70">
                {barcodeBars(receiptId, 28).map((b) => (b.x + b.w <= 160 ? <rect key={b.x} x={b.x} y="0" width={b.w} height="24" fill="currentColor" /> : null))}
              </svg>
            </div>
            <ZigEdge flip />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {urls.map((u, i) =>
              u ? (
                <a key={i} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-accent">
                  {urls.length > 1 ? `Page ${i + 1}` : "View file"} <ExternalLink size={16} />
                </a>
              ) : null,
            )}
            <span className="flex-1" />
            {confirm ? (
              <>
                <span className="text-xs text-muted">The transaction keeps its date, amount and card.</span>
                <Button size="sm" variant="danger" onClick={unlink} disabled={pending}>
                  Confirm unlink
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
                <Unlink size={16} /> Unlink
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
