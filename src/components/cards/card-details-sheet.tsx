"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useAction } from "@/hooks/use-action";
import { saveCardDetails } from "@/app/(app)/transactions/card-actions";
import { CARD_COLORS, ISSUERS, NETWORKS } from "@/lib/receipts/card";
import { CardBadge } from "./card-badge";

export type CardDetails = { id: string; name: string; nickname: string | null; issuer: string | null; network: string | null; color: string | null; last4s: string[] };

/** Nickname, issuer, network, colour and last 4 digits (what lets a scanned receipt find this card). */
export function CardDetailsSheet({ card, open, onClose }: { card: CardDetails; open: boolean; onClose: () => void }) {
  const [v, setV] = useState({ nickname: card.nickname ?? "", issuer: card.issuer ?? "", network: card.network ?? "", color: card.color ?? "" });
  const [last4s, setLast4s] = useState(card.last4s);
  const [draft, setDraft] = useState("");
  const a = useAction();
  const draftOk = /^\d{4}$/.test(draft) && !last4s.includes(draft);

  function addDraft() {
    if (!draftOk) return;
    setLast4s([...last4s, draft]);
    setDraft("");
  }

  return (
    <Sheet open={open} onClose={onClose} title={card.name}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const pending4 = draftOk ? [...last4s, draft] : last4s;
          a.run(
            () =>
              saveCardDetails({
                id: card.id,
                nickname: v.nickname.trim() || null,
                issuer: v.issuer.trim() || null,
                network: (v.network || null) as never,
                color: v.color || null,
                last4s: pending4,
              }),
            onClose,
          );
        }}
      >
        <div className="flex items-center gap-3">
          <CardBadge issuer={v.issuer} nickname={v.nickname} name={card.name} color={v.color} />
          <p className="text-sm text-muted">Shown next to this card in lists. The app recognises the card on receipts by its last 4 digits.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nickname" htmlFor="cd-nick" className="col-span-2">
            <Input id="cd-nick" value={v.nickname} maxLength={60} placeholder="Daily card" onChange={(e) => setV({ ...v, nickname: e.target.value })} />
          </Field>
          <Field label="Issuer" htmlFor="cd-issuer">
            <Input id="cd-issuer" list="cd-issuers" value={v.issuer} maxLength={60} placeholder="Chase" onChange={(e) => setV({ ...v, issuer: e.target.value })} />
            <datalist id="cd-issuers">
              {ISSUERS.map((i) => (
                <option key={i} value={i} />
              ))}
            </datalist>
          </Field>
          <Field label="Network" htmlFor="cd-network">
            <Select id="cd-network" value={v.network} onChange={(e) => setV({ ...v, network: e.target.value })}>
              <option value="">Not set</option>
              {NETWORKS.map((n) => (
                <option key={n.value} value={n.value}>
                  {n.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Last 4 digits" htmlFor="cd-last4" hint="Add each number this card shows: the physical card, a wallet, a reissued card.">
          <div className="space-y-2">
            {last4s.length ? (
              <ul className="flex flex-wrap gap-2">
                {last4s.map((n) => (
                  <li key={n} className="inline-flex items-center gap-1 rounded-full bg-surface-3 py-1 pl-3 pr-1 text-sm">
                    <span className="money">•••• {n}</span>
                    <button type="button" aria-label={`Remove ${n}`} onClick={() => setLast4s(last4s.filter((x) => x !== n))} className="p-1 text-faint transition-colors hover:text-bad">
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex gap-2">
              <Input
                id="cd-last4"
                inputMode="numeric"
                maxLength={4}
                placeholder="4382"
                value={draft}
                className="money"
                onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDraft();
                  }
                }}
              />
              <Button variant="outline" onClick={addDraft} disabled={!draftOk}>
                <Plus size={16} /> Add
              </Button>
            </div>
          </div>
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm text-muted">Colour</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Card colour">
            <button type="button" role="radio" aria-checked={v.color === ""} aria-label="No colour" onClick={() => setV({ ...v, color: "" })} className={`h-8 w-8 rounded-full border border-border bg-surface-2 ${v.color === "" ? "ring-2 ring-accent" : ""}`} />
            {CARD_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={v.color === c}
                aria-label={`Colour ${c.slice(1)}`}
                onClick={() => setV({ ...v, color: c })}
                style={{ background: `var(--${c})` }}
                className={`h-8 w-8 rounded-full ${v.color === c ? "ring-2 ring-text ring-offset-2 ring-offset-bg" : ""}`}
              />
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="accent" disabled={a.pending}>
            Save
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
