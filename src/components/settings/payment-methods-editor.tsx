"use client";

import { useState } from "react";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { deleteListItem, setDefaultPaymentMethod } from "@/app/(app)/settings/actions";
import { type CardSettings } from "@/components/cards/card-forms";
import { NewPaymentMethodSheet } from "./payment-method-new-sheet";
import { KIND_LIST, kindMeta } from "@/lib/payment-kinds";
import { CardBadge } from "@/components/cards/card-badge";
import { PaymentMethodSheet, type CardDetails } from "@/components/cards/payment-method-sheet";
import { formatMoney } from "@/lib/money";

type Item = { id: string; name: string; archived: boolean; uses: number };

export function PaymentMethodsEditor({
  items,
  defaultId,
  cards,
  details,
  currency,
  today,
}: {
  items: Item[];
  defaultId: string | null;
  cards: Record<string, CardSettings>;
  details: Record<string, CardDetails>;
  currency: string;
  today: string;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const a = useAction();

  const groups = KIND_LIST.map((k) => ({ ...k, list: items.filter((it) => kindMeta(details[it.id]?.kind).value === k.value) })).filter((g) => g.list.length);
  const editing = editId ? items.find((it) => it.id === editId) : undefined;

  function row(it: Item) {
    const c = cards[it.id];
    const d = details[it.id];
    const isDefault = defaultId === it.id;
    return (
      <li key={it.id} className="flex items-center gap-3 py-2.5">
        <CardBadge kind={d?.kind} filled={c?.is_credit_card} issuer={d?.issuer} nickname={d?.nickname} name={it.name} color={d?.color} />
        <span className={`min-w-0 flex-1 truncate ${it.archived ? "text-faint line-through" : ""}`}>
          {it.name}
          {d?.nickname ? <span className="ml-2 text-sm text-muted">{d.nickname}</span> : null}
          {d?.last4s.length ? <span className="money ml-2 text-xs text-faint">{d.last4s.map((n) => `•••• ${n}`).join(" ")}</span> : null}
          {c?.is_credit_card && c.credit_limit ? <span className="ml-2 text-sm text-muted">{formatMoney(c.credit_limit, currency, { whole: true })} limit</span> : null}
          <span className="ml-2 text-xs text-muted">{it.uses} uses</span>
        </span>
        <div className="flex items-center">
          {!it.archived ? (
            <Button
              size="icon"
              variant="ghost"
              aria-label={isDefault ? `Remove ${it.name} as default` : `Make ${it.name} the default`}
              aria-pressed={isDefault}
              title={isDefault ? "Default for new transactions (tap to clear)" : "Use as default for new transactions"}
              onClick={() => a.run(() => setDefaultPaymentMethod(isDefault ? null : it.id))}
            >
              <Star size={16} className={isDefault ? "fill-current text-accent" : undefined} />
            </Button>
          ) : null}
          <Button size="icon" variant="ghost" aria-label={`Edit ${it.name}`} title="Edit" onClick={() => setEditId(it.id)}>
            <Pencil size={16} />
          </Button>
          <Button
            size={confirmId === it.id ? "sm" : "icon"}
            variant="ghost"
            className="text-bad"
            aria-label={confirmId === it.id ? "Tap again to delete" : `Delete ${it.name}`}
            onClick={() => (confirmId === it.id ? a.run(() => deleteListItem("payment_methods", it.id), () => setConfirmId(null)) : setConfirmId(it.id))}
          >
            <Trash2 size={16} />
            {confirmId === it.id ? "Confirm" : null}
          </Button>
        </div>
      </li>
    );
  }

  function section(title: string, list: Item[]) {
    return (
      <section key={title} className="mt-5">
        <h3 className="text-label text-muted">{title}</h3>
        <ul className="divide-y divide-border">{list.map(row)}</ul>
      </section>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{items.length} payment methods</p>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={16} /> Add payment method
        </Button>
      </div>
      <NewPaymentMethodSheet open={addOpen} onClose={() => setAddOpen(false)} currency={currency} today={today} />

      {groups.map((g) => section(g.plural, g.list))}

      {editing && cards[editing.id] && details[editing.id] ? (
        <PaymentMethodSheet key={editing.id} card={cards[editing.id]} details={details[editing.id]} archived={editing.archived} open onClose={() => setEditId(null)} currency={currency} today={today} />
      ) : null}
    </Card>
  );
}
