"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useAction } from "@/hooks/use-action";
import { addCardPayment, saveCardSettings } from "@/app/(app)/transactions/card-actions";
import { formatMoney } from "@/lib/money";

export type CardSettings = {
  id: string;
  name: string;
  is_credit_card: boolean;
  credit_limit: number | null;
  statement_day: number | null;
  due_day: number | null;
  opening_balance: number;
  tracking_from: string | null;
};

const num = (s: string) => (s.trim() === "" ? null : Number(s));
const dayOk = (s: string) => s.trim() === "" || (Number.isInteger(Number(s)) && Number(s) >= 1 && Number(s) <= 31);

/** Limit + billing cycle fields, shared by the add form and the edit sheet. */
export function CardFields({
  v,
  set,
  currency,
  showOpening,
}: {
  v: { limit: string; statement: string; due: string; opening?: string; from?: string };
  set: (patch: Partial<{ limit: string; statement: string; due: string; opening: string; from: string }>) => void;
  currency: string;
  showOpening?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={`Credit limit (${currency})`} htmlFor="cc-limit" className="col-span-2">
        <Input id="cc-limit" inputMode="decimal" type="number" min="0" step="any" placeholder="e.g. 5000" value={v.limit} onChange={(e) => set({ limit: e.target.value })} />
      </Field>
      <Field label="Statement day" htmlFor="cc-stmt" hint="Day of the month the bill is generated">
        <Input id="cc-stmt" inputMode="numeric" type="number" min="1" max="31" placeholder="e.g. 5" value={v.statement} onChange={(e) => set({ statement: e.target.value })} />
      </Field>
      <Field label="Payment due day" htmlFor="cc-due" hint="Day the bill must be paid by">
        <Input id="cc-due" inputMode="numeric" type="number" min="1" max="31" placeholder="e.g. 25" value={v.due} onChange={(e) => set({ due: e.target.value })} />
      </Field>
      {showOpening ? (
        <>
          <Field label="Start tracking from" htmlFor="cc-from" hint="Earlier transactions are ignored">
            <Input id="cc-from" type="date" value={v.from ?? ""} onChange={(e) => set({ from: e.target.value })} />
          </Field>
          <Field label={`Balance owed then (${currency})`} htmlFor="cc-open" hint="What you owed on that date">
            <Input id="cc-open" inputMode="decimal" type="number" min="0" step="any" placeholder="0" value={v.opening ?? ""} onChange={(e) => set({ opening: e.target.value })} />
          </Field>
        </>
      ) : null}
    </div>
  );
}

/** Edit sheet: turn credit-card tracking on/off, set limit, cycle and starting balance. */
export function CardSettingsSheet({ card, open, onClose, currency, today }: { card: CardSettings; open: boolean; onClose: () => void; currency: string; today: string }) {
  // opening the sheet means "set this up as a card", so it starts switched on; unticking turns tracking off
  const [on, setOn] = useState(true);
  const [v, setV] = useState({
    limit: card.credit_limit?.toString() ?? "",
    statement: card.statement_day?.toString() ?? "",
    due: card.due_day?.toString() ?? "",
    opening: card.opening_balance ? card.opening_balance.toString() : "",
    from: card.tracking_from ?? today,
  });
  const a = useAction();
  const valid = !on || (Number(v.limit) > 0 && dayOk(v.statement) && dayOk(v.due) && (v.opening === "" || Number(v.opening) >= 0));

  return (
    <Sheet open={open} onClose={onClose} title={card.name}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          a.run(
            () =>
              saveCardSettings({
                id: card.id,
                is_credit_card: on,
                credit_limit: on ? num(v.limit) : card.credit_limit,
                statement_day: num(v.statement),
                due_day: num(v.due),
                opening_balance: num(v.opening ?? "") ?? 0,
                tracking_from: v.from || null,
              }),
            onClose,
          );
        }}
      >
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[var(--accent)]" />
          <span>
            <span className="block">This is a credit card</span>
            <span className="text-sm text-muted">Shows it under Transactions → Credit cards with its balance, bill and utilization.</span>
          </span>
        </label>
        {on ? <CardFields v={v} set={(p) => setV({ ...v, ...p })} currency={currency} showOpening /> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="accent" disabled={!valid || a.pending}>Save</Button>
        </div>
      </form>
    </Sheet>
  );
}

/** Record a bill payment (setoff). Pre-filled with what's left on the last statement. */
export function PaySheet({ cardId, cardName, suggested, outstanding, open, onClose, currency, today }: { cardId: string; cardName: string; suggested: number; outstanding: number; open: boolean; onClose: () => void; currency: string; today: string }) {
  const [amount, setAmount] = useState(suggested > 0 ? suggested.toFixed(2) : "");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const a = useAction();
  const quick = [
    suggested > 0 ? { label: "Statement", value: suggested } : null,
    outstanding > 0 && Math.abs(outstanding - suggested) > 0.005 ? { label: "Full balance", value: outstanding } : null,
  ].filter((x): x is { label: string; value: number } => Boolean(x));

  return (
    <Sheet open={open} onClose={onClose} title={`Pay ${cardName}`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          a.run(() => addCardPayment({ card: cardId, date, amount: Number(amount), note: note.trim() || null }), onClose);
        }}
      >
        <p className="text-sm text-muted">A bill payment lowers what you owe on the card. It isn&apos;t an expense, so your spending totals don&apos;t change.</p>
        <Field label={`Amount (${currency})`} htmlFor="pay-amt">
          <Input id="pay-amt" autoFocus inputMode="decimal" type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        {quick.length ? (
          <div className="flex flex-wrap gap-2">
            {quick.map((q) => (
              <Button key={q.label} size="sm" variant="outline" onClick={() => setAmount(q.value.toFixed(2))}>
                {q.label} · {formatMoney(q.value, currency)}
              </Button>
            ))}
          </div>
        ) : null}
        <Field label="Paid on" htmlFor="pay-date">
          <Input id="pay-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note (optional)" htmlFor="pay-note">
          <Input id="pay-note" maxLength={200} placeholder="e.g. Autopay from savings" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="accent" disabled={!(Number(amount) > 0) || !date || a.pending}>Record payment</Button>
        </div>
      </form>
    </Sheet>
  );
}
