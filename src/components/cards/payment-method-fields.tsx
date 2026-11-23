"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { CARD_COLORS, ISSUERS, NETWORKS } from "@/lib/receipts/card";
import { minDueRule } from "@/lib/cards";
import { formatMoney } from "@/lib/money";
import { KIND_META, type PaymentKind } from "@/lib/payment-kinds";
import { cn } from "@/lib/utils";
import { CardFields } from "./card-forms";

/** Everything the add and edit forms collect. Strings stay strings until `toInput`. */
export type MethodDraft = {
  name: string;
  nickname: string;
  issuer: string;
  network: string;
  color: string;
  last4s: string[];
  limit: string;
  statement: string;
  due: string;
  opening: string;
  from: string;
  minPct: string;
  minFloor: string;
};

export const emptyDraft = (today: string): MethodDraft => ({
  name: "",
  nickname: "",
  issuer: "",
  network: "",
  color: "",
  last4s: [],
  limit: "",
  statement: "",
  due: "",
  opening: "",
  from: today,
  minPct: "",
  minFloor: "",
});

const num = (s: string) => (s.trim() === "" ? null : Number(s));
const dayOk = (s: string) => s.trim() === "" || (Number.isInteger(Number(s)) && Number(s) >= 1 && Number(s) <= 31);

/** Ready to save? Name is needed for every type; a credit card also needs its limit and sane billing days. */
export function draftValid(kind: PaymentKind, v: MethodDraft): boolean {
  if (!v.name.trim()) return false;
  if (!KIND_META[kind].fields.creditTerms) return true;
  const pctOk = v.minPct.trim() === "" || (Number(v.minPct) > 0 && Number(v.minPct) <= 100);
  const floorOk = v.minFloor.trim() === "" || Number(v.minFloor) >= 0;
  return Number(v.limit) > 0 && dayOk(v.statement) && dayOk(v.due) && (v.opening === "" || Number(v.opening) >= 0) && pctOk && floorOk;
}

/** Draft to the payload the server actions take. A last 4 typed but not yet added is included. */
export function toInput(kind: PaymentKind, v: MethodDraft, pending: string) {
  const last4s = /^\d{4}$/.test(pending) && !v.last4s.includes(pending) ? [...v.last4s, pending] : v.last4s;
  return {
    kind,
    name: v.name.trim(),
    nickname: v.nickname.trim() || null,
    issuer: v.issuer.trim() || null,
    network: (v.network || null) as never,
    color: v.color || null,
    last4s,
    credit_limit: num(v.limit),
    statement_day: num(v.statement),
    due_day: num(v.due),
    opening_balance: num(v.opening) ?? 0,
    tracking_from: v.from || null,
    min_due_pct: num(v.minPct),
    min_due_floor: num(v.minFloor),
  };
}

/** The type-specific part of the form: only the fields this type uses, then colour. */
export function MethodFields({
  kind,
  v,
  set,
  currency,
  pending,
  setPending,
  showOpening = true,
  idPrefix,
}: {
  kind: PaymentKind;
  v: MethodDraft;
  set: (patch: Partial<MethodDraft>) => void;
  currency: string;
  pending: string;
  setPending: (s: string) => void;
  showOpening?: boolean;
  idPrefix: string;
}) {
  const f = KIND_META[kind].fields;
  const defaults = minDueRule(currency);
  const draftOk = /^\d{4}$/.test(pending) && !v.last4s.includes(pending);

  function addPending() {
    if (!draftOk) return;
    set({ last4s: [...v.last4s, pending] });
    setPending("");
  }

  return (
    <>
      {f.creditTerms ? (
        <>
          <CardFields
            v={{ limit: v.limit, statement: v.statement, due: v.due, opening: v.opening, from: v.from }}
            set={(p) => set({ ...(p.limit !== undefined && { limit: p.limit }), ...(p.statement !== undefined && { statement: p.statement }), ...(p.due !== undefined && { due: p.due }), ...(p.opening !== undefined && { opening: p.opening }), ...(p.from !== undefined && { from: p.from }) })}
            currency={currency}
            showOpening={showOpening}
          />
          <div className="grid grid-cols-2 gap-3">
            <p className="col-span-2 text-sm text-muted">
              Minimum due: the larger of a % of the bill or a fixed floor, plus all EMI installments. Leave blank for {defaults.pct}% / {formatMoney(defaults.floor, currency, { whole: true })}.
            </p>
            <Field label="Minimum due %" htmlFor={`${idPrefix}-minpct`}>
              <Input id={`${idPrefix}-minpct`} inputMode="decimal" type="number" min="0" max="100" step="any" placeholder={String(defaults.pct)} value={v.minPct} onChange={(e) => set({ minPct: e.target.value })} />
            </Field>
            <Field label={`Minimum floor (${currency})`} htmlFor={`${idPrefix}-minfloor`}>
              <Input id={`${idPrefix}-minfloor`} inputMode="decimal" type="number" min="0" step="any" placeholder={String(defaults.floor)} value={v.minFloor} onChange={(e) => set({ minFloor: e.target.value })} />
            </Field>
          </div>
        </>
      ) : null}

      {f.nickname || f.issuer || f.network ? (
        <div className="grid grid-cols-2 gap-3">
          {f.nickname ? (
            <Field label="Nickname" htmlFor={`${idPrefix}-nick`} className="col-span-2">
              <Input id={`${idPrefix}-nick`} value={v.nickname} maxLength={60} placeholder="Daily card" onChange={(e) => set({ nickname: e.target.value })} />
            </Field>
          ) : null}
          {f.issuer ? (
            <Field label={f.issuerLabel} htmlFor={`${idPrefix}-issuer`} className={f.network ? undefined : "col-span-2"}>
              <Input id={`${idPrefix}-issuer`} list={`${idPrefix}-issuers`} value={v.issuer} maxLength={60} placeholder="Chase" onChange={(e) => set({ issuer: e.target.value })} />
              <datalist id={`${idPrefix}-issuers`}>
                {ISSUERS.map((i) => (
                  <option key={i} value={i} />
                ))}
              </datalist>
            </Field>
          ) : null}
          {f.network ? (
            <Field label="Network" htmlFor={`${idPrefix}-network`}>
              <Select id={`${idPrefix}-network`} value={v.network} onChange={(e) => set({ network: e.target.value })}>
                <option value="">Not set</option>
                {NETWORKS.map((n) => (
                  <option key={n.value} value={n.value}>
                    {n.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
      ) : null}

      {f.last4s ? (
        <Field label="Last 4 digits" htmlFor={`${idPrefix}-last4`} hint="Add each number this card shows: the physical card, a wallet, a reissued card. Receipts find the card by these.">
          <div className="space-y-2">
            {v.last4s.length ? (
              <ul className="flex flex-wrap gap-2">
                {v.last4s.map((n) => (
                  <li key={n} className="inline-flex items-center gap-1 rounded-full bg-surface-3 py-1 pl-3 pr-1 text-sm">
                    <span className="money">•••• {n}</span>
                    <button type="button" aria-label={`Remove ${n}`} onClick={() => set({ last4s: v.last4s.filter((x) => x !== n) })} className="p-1 text-faint transition-colors hover:text-bad">
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex gap-2">
              <Input
                id={`${idPrefix}-last4`}
                inputMode="numeric"
                maxLength={4}
                placeholder="4382"
                value={pending}
                className="money"
                onChange={(e) => setPending(e.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPending();
                  }
                }}
              />
              <Button variant="outline" onClick={addPending} disabled={!draftOk}>
                <Plus size={16} /> Add
              </Button>
            </div>
          </div>
        </Field>
      ) : null}

      <fieldset>
        <legend className="mb-2 text-sm text-muted">Colour</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
          <button type="button" role="radio" aria-checked={v.color === ""} aria-label="No colour" onClick={() => set({ color: "" })} className={cn("h-8 w-8 rounded-full border border-border bg-surface-2", v.color === "" && "ring-2 ring-accent")} />
          {CARD_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={v.color === c}
              aria-label={`Colour ${c.slice(1)}`}
              onClick={() => set({ color: c })}
              style={{ background: `var(--${c})` }}
              className={cn("h-8 w-8 rounded-full", v.color === c && "ring-2 ring-text ring-offset-2 ring-offset-bg")}
            />
          ))}
        </div>
      </fieldset>
    </>
  );
}
