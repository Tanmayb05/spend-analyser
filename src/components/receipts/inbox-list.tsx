"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { deleteReceiptAction, loadReceiptDraftAction, type ReceiptDraft } from "@/app/(app)/receipts/actions";
import type { InboxReceipt } from "@/lib/receipts/inbox";
import { ReceiptReview } from "./receipt-review";
import { ReceiptLink } from "./receipt-link";
import type { CardChoice } from "./card-choice";

/** Receipts waiting for a transaction. Match opens the saved receipt in the same review and link steps the scan flow uses. */
export function InboxList({ receipts }: { receipts: InboxReceipt[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [step, setStep] = useState<"review" | "link">("review");
  const [card, setCard] = useState<CardChoice>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    setOpenId(null);
    setDraft(null);
    setCard(null);
    setStep("review");
  };

  function open(id: string) {
    setOpenId(id);
    setDraft(null);
    start(async () => {
      const res = await loadReceiptDraftAction(id);
      if (!res.ok) {
        toast.error(res.error);
        return close();
      }
      setDraft(res.draft);
      setStep("review");
    });
  }

  function remove(r: InboxReceipt) {
    start(async () => {
      const res = await deleteReceiptAction(r.id);
      setConfirming(null);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.unlinked ? `Receipt deleted. ${res.unlinked} linked transaction${res.unlinked === 1 ? "" : "s"} kept` : "Receipt deleted");
      router.refresh();
    });
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {receipts.map((r) => {
          const name = r.merchant || r.label || "Receipt";
          return (
            <li key={r.id} className="py-3" data-testid="inbox-row">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{name}</p>
                  <p className="truncate text-xs text-muted">
                    {r.date ? formatDay(r.date) : "No date"}
                    {r.paymentName ? ` · ${r.paymentName}` : r.cardLast4 ? ` · card ${r.cardLast4}` : ""}
                    {r.pages > 1 ? ` · ${r.pages} pages` : ""}
                    {r.label && r.merchant ? ` · ${r.label}` : ""}
                  </p>
                </div>
                <span className="money shrink-0 text-sm">{formatMoney(r.total, r.currency)}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {r.partial ? <Badge tone="warn">Partly matched: {formatMoney(r.matched, r.currency)} of {formatMoney(r.total, r.currency)}</Badge> : <Badge>Kept for later</Badge>}
                {r.suggestions > 0 ? (
                  <Badge tone="accent">
                    {r.suggestions === 1 ? "1 likely match" : `${r.suggestions} likely matches`}
                    {r.top ? `: ${formatMoney(r.top.amount, r.top.currency)} on ${formatDay(r.top.date)}` : ""}
                  </Badge>
                ) : null}
                <span className="flex-1" />
                {confirming === r.id ? (
                  <>
                    <span className="text-xs text-muted">Delete this receipt and its files?</span>
                    <Button size="sm" variant="outline" onClick={() => setConfirming(null)} disabled={pending}>
                      Cancel
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove(r)} disabled={pending}>
                      Delete
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" onClick={() => open(r.id)} disabled={pending}>
                      {r.partial ? "Match the rest" : "Match"}
                    </Button>
                    <button type="button" aria-label={`Delete ${name}`} onClick={() => setConfirming(r.id)} className="p-2 text-faint transition-colors hover:text-bad">
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Sheet open={openId !== null} onClose={close} title="Match receipt">
        {openId && !draft ? (
          <p role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Opening receipt…
          </p>
        ) : null}
        {draft && step === "review" ? <ReceiptReview draft={draft} onChange={setDraft} card={card} onCard={setCard} position={null} onBack={close} onNext={() => setStep("link")} /> : null}
        {draft && step === "link" ? <ReceiptLink draft={draft} card={card} fromInbox onBack={() => setStep("review")} onSaved={close} remainingCount={0} /> : null}
      </Sheet>
    </>
  );
}
