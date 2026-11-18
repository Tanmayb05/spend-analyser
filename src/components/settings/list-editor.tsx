"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Check, CreditCard, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { useAction } from "@/hooks/use-action";
import { deleteListItem, saveListItem, setDefaultPaymentMethod, setListItemArchived } from "@/app/(app)/settings/actions";
import { addCreditCard } from "@/app/(app)/transactions/card-actions";
import { CardFields, CardSettingsSheet, type CardSettings } from "@/components/cards/card-forms";
import { formatMoney } from "@/lib/money";

type Item = { id: string; name: string; archived: boolean; is_self?: boolean; uses: number };

export function ListEditor({
  table,
  items,
  noun,
  defaultId,
  cards,
  currency = "USD",
  today = "",
}: {
  table: "payment_methods" | "people";
  items: Item[];
  noun: string;
  /** payment methods only: the one pre-selected on new transactions */
  defaultId?: string | null;
  /** payment methods only: credit-card settings by id */
  cards?: Record<string, CardSettings>;
  currency?: string;
  today?: string;
}) {
  const [adding, setAdding] = useState("");
  const [isCard, setIsCard] = useState(false);
  const [cardV, setCardV] = useState({ limit: "", statement: "", due: "" });
  const [cardSheet, setCardSheet] = useState<string | null>(null);
  const withCards = table === "payment_methods" && cards;
  const dayNum = (x: string) => (x.trim() === "" ? null : Number(x));
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const a = useAction();

  return (
    <Card>
      <form
        className="mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          const reset = () => {
            setAdding("");
            setIsCard(false);
            setCardV({ limit: "", statement: "", due: "" });
          };
          if (withCards && isCard) {
            a.run(
              () => addCreditCard({ name: adding, credit_limit: Number(cardV.limit), statement_day: dayNum(cardV.statement), due_day: dayNum(cardV.due), tracking_from: today }),
              reset,
            );
          } else a.run(() => saveListItem(table, { name: adding }), reset);
        }}
      >
        <div className="flex gap-2">
          <Input placeholder={`New ${noun}`} value={adding} onChange={(e) => setAdding(e.target.value)} aria-label={`New ${noun}`} />
          <Button type="submit" disabled={!adding.trim() || (isCard && !(Number(cardV.limit) > 0)) || a.pending}>
            <Plus size={16} /> Add
          </Button>
        </div>
        {withCards ? (
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isCard} onChange={(e) => setIsCard(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
            It&apos;s a credit card
          </label>
        ) : null}
        {withCards && isCard ? (
          <div className="mt-3">
            <CardFields v={cardV} set={(p) => setCardV({ ...cardV, ...p })} currency={currency} />
          </div>
        ) : null}
      </form>
      <ul className="divide-y divide-border">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2 py-2.5">
            {editing?.id === it.id ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  a.run(() => saveListItem(table, editing), () => setEditing(null));
                }}
              >
                <Input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-10" aria-label="Name" />
                <Button type="submit" size="icon" variant="ghost" aria-label="Save"><Check size={18} /></Button>
                <Button size="icon" variant="ghost" aria-label="Cancel" onClick={() => setEditing(null)}><X size={18} /></Button>
              </form>
            ) : (
              <>
                <span className={`min-w-0 flex-1 truncate ${it.archived ? "text-faint line-through" : ""}`}>{it.name}</span>
                {it.is_self ? <Badge tone="accent">You</Badge> : null}
                {table === "payment_methods" && defaultId === it.id ? <Badge tone="accent">Default</Badge> : null}
                {cards?.[it.id]?.is_credit_card ? (
                  <Badge className="hidden sm:inline-flex">
                    Credit card{cards[it.id].credit_limit ? ` · ${formatMoney(cards[it.id].credit_limit!, currency, { whole: true })}` : ""}
                  </Badge>
                ) : null}
                <span className="text-xs text-muted">{it.uses} uses</span>
                {table === "payment_methods" && !it.archived ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={defaultId === it.id ? `Remove ${it.name} as default` : `Make ${it.name} the default`}
                    aria-pressed={defaultId === it.id}
                    title={defaultId === it.id ? "Default for new transactions (tap to clear)" : "Use as default for new transactions"}
                    onClick={() => a.run(() => setDefaultPaymentMethod(defaultId === it.id ? null : it.id))}
                  >
                    <Star size={16} className={defaultId === it.id ? "fill-current text-accent" : undefined} />
                  </Button>
                ) : null}
                {withCards && !it.archived ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={cards[it.id]?.is_credit_card ? `Credit card settings for ${it.name}` : `Set up ${it.name} as a credit card`}
                    title={cards[it.id]?.is_credit_card ? "Credit card: limit and billing days" : "Mark as a credit card"}
                    onClick={() => setCardSheet(it.id)}
                  >
                    <CreditCard size={16} className={cards[it.id]?.is_credit_card ? "text-accent" : undefined} />
                  </Button>
                ) : null}
                <Button size="icon" variant="ghost" aria-label={`Rename ${it.name}`} onClick={() => setEditing({ id: it.id, name: it.name })}><Pencil size={16} /></Button>
                <Button size="icon" variant="ghost" aria-label={it.archived ? "Restore" : "Archive"} title={it.archived ? "Restore" : "Archive (hide from pickers)"} onClick={() => a.run(() => setListItemArchived(table, it.id, !it.archived))}>
                  {it.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                </Button>
                {!it.is_self ? (
                  <Button
                    size={confirmId === it.id ? "sm" : "icon"}
                    variant="ghost"
                    className="text-bad"
                    aria-label={confirmId === it.id ? "Tap again to delete" : `Delete ${it.name}`}
                    onClick={() => (confirmId === it.id ? a.run(() => deleteListItem(table, it.id), () => setConfirmId(null)) : setConfirmId(it.id))}
                  >
                    <Trash2 size={16} />
                    {confirmId === it.id ? "Confirm" : null}
                  </Button>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>
      {withCards && cardSheet && cards[cardSheet] ? (
        <CardSettingsSheet card={cards[cardSheet]} open onClose={() => setCardSheet(null)} currency={currency} today={today} />
      ) : null}
    </Card>
  );
}
