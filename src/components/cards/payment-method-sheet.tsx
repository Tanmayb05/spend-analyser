"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useAction } from "@/hooks/use-action";
import { setListItemArchived } from "@/app/(app)/settings/actions";
import { savePaymentMethod } from "@/app/(app)/transactions/card-actions";
import { KIND_LIST, KIND_META, kindMeta, type PaymentKind } from "@/lib/payment-kinds";
import { CardBadge } from "./card-badge";
import type { CardSettings } from "./card-forms";
import { draftValid, MethodFields, toInput, type MethodDraft } from "./payment-method-fields";

export type CardDetails = { id: string; name: string; kind: string; nickname: string | null; issuer: string | null; network: string | null; color: string | null; last4s: string[] };

/** What a type change will clear, in plain words, or null when nothing is lost. */
function lostOnChange(from: PaymentKind, to: PaymentKind, v: MethodDraft): string | null {
  const a = KIND_META[from].fields;
  const b = KIND_META[to].fields;
  const lost: string[] = [];
  if (a.nickname && !b.nickname && v.nickname.trim()) lost.push("nickname");
  if (a.issuer && !b.issuer && v.issuer.trim()) lost.push(a.issuerLabel.toLowerCase());
  if (a.network && !b.network && v.network) lost.push("network");
  if (a.last4s && !b.last4s && v.last4s.length) lost.push("last 4 digits");
  if (a.creditTerms && !b.creditTerms && (v.limit || v.statement || v.due || v.opening)) lost.push("credit limit and billing");
  return lost.length ? `Switching to ${KIND_META[to].label.toLowerCase()} removes the ${lost.join(", ")} when you save.` : null;
}

/** One place to edit a payment method: name, type, the details that type uses, colour, archive. */
export function PaymentMethodSheet({
  card,
  details,
  archived,
  open,
  onClose,
  currency,
  today,
}: {
  card: CardSettings;
  details: CardDetails;
  archived: boolean;
  open: boolean;
  onClose: () => void;
  currency: string;
  today: string;
}) {
  const startKind = kindMeta(details.kind).value;
  const [kind, setKind] = useState<PaymentKind>(startKind);
  const [v, setV] = useState<MethodDraft>({
    name: card.name,
    nickname: details.nickname ?? "",
    issuer: details.issuer ?? "",
    network: details.network ?? "",
    color: details.color ?? "",
    last4s: details.last4s,
    limit: card.credit_limit?.toString() ?? "",
    statement: card.statement_day?.toString() ?? "",
    due: card.due_day?.toString() ?? "",
    opening: card.opening_balance ? card.opening_balance.toString() : "",
    from: card.tracking_from ?? today,
    minPct: card.min_due_pct?.toString() ?? "",
    minFloor: card.min_due_floor?.toString() ?? "",
  });
  const [pending, setPending] = useState("");
  const a = useAction();
  const set = (p: Partial<MethodDraft>) => setV((x) => ({ ...x, ...p }));
  const valid = draftValid(kind, v);
  const warning = kind === startKind ? null : lostOnChange(startKind, kind, v);

  return (
    <Sheet open={open} onClose={onClose} title="Edit payment method" bare>
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          a.run(() => savePaymentMethod({ id: card.id, ...toInput(kind, v, pending) }), onClose);
        }}
      >
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-card py-card">
          <div className="flex items-center gap-3">
            <CardBadge kind={kind} filled={kind === "credit_card"} issuer={v.issuer} nickname={v.nickname} name={v.name || card.name} color={v.color} />
            <Field label="Name" htmlFor="pm-name" className="flex-1">
              <Input id="pm-name" value={v.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
            </Field>
          </div>

          <Field label="Type" htmlFor="pm-kind" hint={KIND_META[kind].hint}>
            <Select id="pm-kind" value={kind} onChange={(e) => setKind(e.target.value as PaymentKind)}>
              {KIND_LIST.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          {warning ? <p className="rounded-inset bg-warn/15 px-3 py-2 text-sm text-warn">{warning}</p> : null}

          <MethodFields kind={kind} v={v} set={set} currency={currency} pending={pending} setPending={setPending} idPrefix="pm" />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-surface px-card py-3 pb-safe">
          <Button variant="ghost" className="-ml-3" onClick={() => a.run(() => setListItemArchived("payment_methods", card.id, !archived), onClose)}>
            {archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
            {archived ? "Restore" : "Archive"}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              <X size={16} />
              Cancel
            </Button>
            <Button type="submit" variant="accent" className="min-w-24" disabled={!valid || a.pending}>
              Save
            </Button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
