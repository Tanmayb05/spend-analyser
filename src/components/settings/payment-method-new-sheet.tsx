"use client";

import { useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useAction } from "@/hooks/use-action";
import { createPaymentMethod } from "@/app/(app)/transactions/card-actions";
import { CardBadge } from "@/components/cards/card-badge";
import { draftValid, emptyDraft, MethodFields, toInput, type MethodDraft } from "@/components/cards/payment-method-fields";
import { inferKind, KIND_LIST, KIND_META, type PaymentKind } from "@/lib/payment-kinds";
import { cn } from "@/lib/utils";

/** Add a payment method in its own dialog: pick a type, then fill in only what that type needs. */
export function NewPaymentMethodSheet({ open, onClose, currency, today }: { open: boolean; onClose: () => void; currency: string; today: string }) {
  const [kind, setKind] = useState<PaymentKind | null>(null);
  const [v, setV] = useState<MethodDraft>(() => emptyDraft(today));
  const [pending, setPending] = useState("");
  const a = useAction();
  const set = (p: Partial<MethodDraft>) => setV((x) => ({ ...x, ...p }));
  const guess = kind ? inferKind(v.name) : null;
  const valid = kind ? draftValid(kind, v) : false;

  const close = () => {
    onClose();
    setKind(null);
    setV(emptyDraft(today));
    setPending("");
  };

  return (
    <Sheet open={open} onClose={close} title={kind ? `New ${KIND_META[kind].label.toLowerCase()}` : "Add payment method"} bare>
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          if (!kind || !valid) return;
          a.run(() => createPaymentMethod(toInput(kind, v, pending)), close);
        }}
      >
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-card py-card">
          {kind === null ? (
            <>
              <p className="text-sm text-muted">What kind of payment method is it?</p>
              <div role="group" aria-label="Type" className="grid gap-2 sm:grid-cols-2">
                {KIND_LIST.map((k) => {
                  const Icon = k.icon;
                  return (
                    <button
                      key={k.value}
                      type="button"
                      onClick={() => setKind(k.value)}
                      className="flex items-start gap-3 rounded-control border border-border bg-surface-2 p-3 text-left transition-colors duration-(--dur-fast) hover:bg-surface-3"
                    >
                      <Icon size={18} className="mt-0.5 shrink-0 text-muted" />
                      <span>
                        <span className="block text-sm font-medium">{k.label}</span>
                        <span className="block text-xs text-muted">{k.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <CardBadge kind={kind} filled={kind === "credit_card"} issuer={v.issuer} nickname={v.nickname} name={v.name || KIND_META[kind].label} color={v.color} />
                <Field label="Name" htmlFor="npm-name" className="flex-1">
                  <Input id="npm-name" autoFocus value={v.name} maxLength={60} placeholder={kind === "wallet" ? "e.g. Apple Pay" : kind === "cash" ? "e.g. Wallet cash" : "e.g. Amex Gold"} onChange={(e) => set({ name: e.target.value })} />
                </Field>
              </div>
              {guess && guess !== kind ? (
                <p className={cn("text-sm text-muted")}>
                  Sounds like {KIND_META[guess].label.toLowerCase()}.{" "}
                  <button type="button" className="text-text underline underline-offset-2" onClick={() => setKind(guess)}>
                    Switch type
                  </button>
                </p>
              ) : null}
              <MethodFields kind={kind} v={v} set={set} currency={currency} pending={pending} setPending={setPending} showOpening={false} idPrefix="npm" />
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-surface px-card py-3 pb-safe">
          {kind ? (
            <Button variant="ghost" className="-ml-3" onClick={() => setKind(null)}>
              <ArrowLeft size={16} />
              Type
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={close}>
              <X size={16} />
              Cancel
            </Button>
            {kind ? (
              <Button type="submit" className="min-w-24" disabled={!valid || a.pending}>
                Create
              </Button>
            ) : null}
          </div>
        </div>
      </form>
    </Sheet>
  );
}
