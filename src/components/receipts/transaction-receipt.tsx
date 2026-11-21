"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ExternalLink, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
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
          <p className="text-xs text-muted">
            {r.subtotal != null ? `Subtotal ${formatMoney(r.subtotal, cur)}` : ""}
            {r.fees ? ` · fees ${formatMoney(r.fees, cur)}` : ""}
            {r.tax ? ` · tax ${formatMoney(r.tax, cur)}` : ""}
            {r.total != null ? ` · total ${formatMoney(r.total, cur)}` : ""}
            {r.tip ? ` · tip ${formatMoney(r.tip, cur)}` : ""}
          </p>
          {items.length ? (
            <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-inset border border-border">
              {items.map((i) => (
                <li key={i.id} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {i.normalized_name || i.raw_name}
                    {i.quantity && i.quantity !== 1 ? <span className="text-faint"> × {i.quantity}</span> : null}
                  </span>
                  <span className="money shrink-0">{i.total_price != null ? i.total_price.toFixed(2) : ""}</span>
                </li>
              ))}
            </ul>
          ) : null}
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
