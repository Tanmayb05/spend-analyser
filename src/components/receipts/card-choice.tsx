"use client";

import { Field, Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { useAppData } from "@/components/app-data";
import { ISSUERS, NETWORKS, networkOf, type Network } from "@/lib/receipts/card";

/** What to do with a card number the app has not seen before. null = not now. */
export type CardChoice =
  | { mode: "existing"; paymentMethodId: string }
  | { mode: "new"; name: string; issuer: string; network: Network | "" }
  | null;

type Mode = "existing" | "new" | "skip";

/** Shown when a receipt prints card digits that belong to no saved card: add them to a card, or create one. */
export function CardChoiceField({ last4, brand, choice, onChange, onPaymentMethod }: { last4: string; brand: string | null; choice: CardChoice; onChange: (c: CardChoice) => void; onPaymentMethod: (id: string) => void }) {
  const app = useAppData();
  const methods = app.paymentMethods.filter((p) => !p.archived);
  const mode: Mode = choice?.mode ?? "skip";

  function setMode(m: Mode) {
    if (m === "skip") {
      onChange(null);
      onPaymentMethod("");
    } else if (m === "existing") {
      const id = methods[0]?.id ?? "";
      onChange(id ? { mode: "existing", paymentMethodId: id } : null);
      onPaymentMethod(id);
    } else {
      onChange({ mode: "new", name: brand ? `${brand} ${last4}` : `Card ${last4}`, issuer: "", network: networkOf(brand) ?? "" });
      onPaymentMethod("");
    }
  }

  return (
    <div className="space-y-3 rounded-inset border border-border bg-surface-2 p-3">
      <p className="text-sm">
        {brand ? `${brand} ` : "Card "}ending <span className="money">{last4}</span> isn&apos;t saved yet. Remember it for next time?
      </p>
      <Segmented
        className="w-full [&>button]:flex-1"
        size="sm"
        value={mode}
        onChange={setMode}
        ariaLabel="Save this card number"
        options={[
          { value: "existing", label: "Add to a card" },
          { value: "new", label: "New card" },
          { value: "skip", label: "Not now" },
        ]}
      />
      {choice?.mode === "existing" ? (
        <Field label="Card" htmlFor="cc-existing">
          <Select
            id="cc-existing"
            value={choice.paymentMethodId}
            onChange={(e) => {
              onChange({ mode: "existing", paymentMethodId: e.target.value });
              onPaymentMethod(e.target.value);
            }}
          >
            {methods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nickname || p.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {choice?.mode === "new" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" htmlFor="cc-name" className="col-span-2">
            <Input id="cc-name" value={choice.name} maxLength={60} onChange={(e) => onChange({ ...choice, name: e.target.value })} />
          </Field>
          <Field label="Issuer" htmlFor="cc-issuer">
            <Input id="cc-issuer" list="cc-issuers" value={choice.issuer} maxLength={60} placeholder="Chase" onChange={(e) => onChange({ ...choice, issuer: e.target.value })} />
            <datalist id="cc-issuers">
              {ISSUERS.map((i) => (
                <option key={i} value={i} />
              ))}
            </datalist>
          </Field>
          <Field label="Network" htmlFor="cc-network">
            <Select id="cc-network" value={choice.network} onChange={(e) => onChange({ ...choice, network: e.target.value as Network | "" })}>
              <option value="">Not sure</option>
              {NETWORKS.map((n) => (
                <option key={n.value} value={n.value}>
                  {n.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : null}
    </div>
  );
}
