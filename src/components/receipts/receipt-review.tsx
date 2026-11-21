"use client";

import { AlertTriangle, ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { useAppData } from "@/components/app-data";
import { allCurrencies, formatMoney } from "@/lib/money";
import { round2 } from "@/lib/utils";
import type { ReceiptDraft } from "@/app/(app)/receipts/actions";
import { CardChoiceField, type CardChoice } from "./card-choice";

const CURRENCIES = allCurrencies();

/** Check what was read before anything is linked or saved. */
export function ReceiptReview({
  draft,
  onChange,
  card,
  onCard,
  position,
  onBack,
  onNext,
}: {
  draft: ReceiptDraft;
  onChange: (d: ReceiptDraft) => void;
  card: CardChoice;
  onCard: (c: CardChoice) => void;
  position: string | null;
  onBack: () => void;
  onNext: () => void;
}) {
  const app = useAppData();
  const itemsSum = round2(draft.items.reduce((a, i) => a + (Number(i.total_price) || 0), 0));
  const set = <K extends keyof ReceiptDraft>(k: K, v: ReceiptDraft[K]) => onChange({ ...draft, [k]: v });
  const setItem = (idx: number, patch: Partial<ReceiptDraft["items"][number]>) => onChange({ ...draft, items: draft.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });
  const unknownCard = !!draft.cardLast4 && !draft.paymentMethodId;
  const paid = draft.totalPaid != null && draft.totalPaid !== draft.total ? draft.totalPaid : null;
  const cur = draft.currency;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-text">
          <ArrowLeft size={16} /> Back
        </button>
        {position ? <span className="text-sm text-muted">{position}</span> : null}
      </div>
      <p className="text-sm text-muted">
        {draft.items.length} item{draft.items.length === 1 ? "" : "s"} found{draft.pages.length > 1 ? ` on ${draft.pages.length} pages` : ""}. Check and fix anything wrong.
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {draft.pages.map((p, i) =>
          p.url ? (
            <a key={i} href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-accent">
              {draft.pages.length > 1 ? `Page ${i + 1}` : "View file"} <ExternalLink size={16} />
            </a>
          ) : null,
        )}
      </div>

      {draft.linkedCount > 0 ? (
        <p className="rounded-inset border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          This receipt is already saved and linked to {draft.linkedCount} transaction{draft.linkedCount === 1 ? "" : "s"}. Saving again updates it.
        </p>
      ) : null}
      {draft.warnings.length ? (
        <p className="flex items-start gap-2 rounded-inset border border-border bg-surface-2 px-3 py-2 text-xs text-warn">
          <AlertTriangle size={16} className="mt-px shrink-0" /> <span>{draft.warnings.join(". ")}. A line may be missing or wrong.</span>
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Merchant" htmlFor="rm">
          <Input id="rm" value={draft.merchant} onChange={(e) => set("merchant", e.target.value)} />
        </Field>
        <Field label="Date" htmlFor="rd" error={draft.dateMissing ? "No date on this receipt. Confirm the date." : null}>
          <Input id="rd" type="date" value={draft.date} onChange={(e) => onChange({ ...draft, date: e.target.value, dateMissing: false })} />
        </Field>
        <Field label="Currency" htmlFor="rc">
          <Select id="rc" value={cur} onChange={(e) => set("currency", e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Receipt total" htmlFor="rt" hint={paid ? `With the tip written on it: ${formatMoney(paid, cur)}` : undefined}>
          <Input id="rt" type="number" inputMode="decimal" step="0.01" value={draft.total} onChange={(e) => set("total", Number(e.target.value))} className="money text-right" />
        </Field>
        <Field label="Label" htmlFor="rl" hint="Only for finding this receipt later" className="col-span-2">
          <Input id="rl" value={draft.label} maxLength={120} onChange={(e) => set("label", e.target.value)} />
        </Field>
      </div>
      <p className="text-xs text-muted">
        Items {formatMoney(itemsSum, cur)}
        {draft.fees ? ` · fees ${formatMoney(draft.fees, cur)}` : ""}
        {draft.tax ? ` · tax ${formatMoney(draft.tax, cur)}` : ""}
        {draft.discount ? ` · savings ${formatMoney(draft.discount, cur)}` : ""}
        {draft.tip ? ` · tip ${formatMoney(draft.tip, cur)} (${draft.tipSource})` : ""}
      </p>

      <Field label="Paid with" htmlFor="rpm" hint={draft.cardLast4 && draft.paymentMethodId ? `${draft.cardBrand ?? "Card"} ending ${draft.cardLast4}, recognised` : undefined}>
        <Select id="rpm" value={draft.paymentMethodId} onChange={(e) => set("paymentMethodId", e.target.value)} disabled={unknownCard && card !== null}>
          <option value="">—</option>
          {app.paymentMethods
            .filter((p) => !p.archived)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.nickname || p.name}
              </option>
            ))}
        </Select>
      </Field>
      {unknownCard ? <CardChoiceField last4={draft.cardLast4!} brand={draft.cardBrand} choice={card} onChange={onCard} onPaymentMethod={(id) => set("paymentMethodId", id)} /> : null}

      <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-control border border-border">
        {draft.items.map((it, idx) => (
          <li key={idx} className="p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <input aria-label={`Item ${idx + 1} name`} value={it.normalized_name} onChange={(e) => setItem(idx, { normalized_name: e.target.value })} className="w-full bg-transparent text-sm font-medium outline-none" />
                <p className="truncate text-xs text-faint">
                  {it.raw_name}
                  {it.quantity ? ` · ${it.quantity}${it.unit ? ` ${it.unit}` : ""}` : ""}
                  {it.unit_price ? ` @ ${formatMoney(it.unit_price, cur)}` : ""}
                  {it.line_discount ? ` · coupon ${formatMoney(it.line_discount, cur)}` : ""}
                </p>
              </div>
              <input
                aria-label={`Item ${idx + 1} price`}
                type="number"
                inputMode="decimal"
                step="0.01"
                value={it.total_price}
                onChange={(e) => setItem(idx, { total_price: Number(e.target.value) })}
                className="money w-24 rounded-inset bg-surface-3 px-2 py-1 text-right text-sm outline-none focus:ring-2 focus:ring-accent/30"
              />
              <button type="button" aria-label={`Remove item ${idx + 1}`} onClick={() => onChange({ ...draft, items: draft.items.filter((_, i) => i !== idx) })} className="p-1 text-faint transition-colors hover:text-bad">
                <Trash2 size={16} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Button size="lg" className="w-full" onClick={onNext} disabled={!(draft.total > 0) || !draft.date}>
        Continue
      </Button>
    </div>
  );
}
