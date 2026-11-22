"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { useAppData } from "@/components/app-data";
import { DescribeInput } from "@/components/ai/describe-input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { blankValues, toSaveInput } from "@/components/transactions/entry-model";
import { saveTransaction } from "@/app/(app)/transactions/actions";
import { parseTextAction, type TxnPreset } from "@/app/(app)/ai/actions";
import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

type Card = { key: number; preset: TxnPreset; error?: string };

/**
 * Describe it: type or say what you spent, check the result on a small card, save with one tap.
 * Nothing is saved until the user presses Save. "Edit" hands the entry to the full form.
 */
export function AiEntry({ onEdit, onReceipt }: { onEdit: (presets: TxnPreset[]) => void; onReceipt: () => void }) {
  const app = useAppData();
  const router = useRouter();
  const [text, setText] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const [failedText, setFailedText] = useState<string | null>(null);
  const [reading, startRead] = useTransition();
  const [saving, startSave] = useTransition();
  const seq = useRef(0);
  const saveBtn = useRef<HTMLButtonElement>(null);

  const run = (t: string) =>
    startRead(async () => {
      setFailedText(null);
      const res = await parseTextAction(t);
      if (!res.ok) {
        toast.error(res.error);
        setFailedText(t);
        return;
      }
      if (!res.presets.length) {
        toast.message("Couldn't find a transaction in that. Try adding an amount.");
        setFailedText(t);
        return;
      }
      if (res.note) toast.message(res.note);
      setCards(res.presets.map((preset) => ({ key: ++seq.current, preset })));
      setText("");
      setTimeout(() => saveBtn.current?.focus(), 0);
    });

  const line = (preset: TxnPreset) => {
    const v = blankValues(app, preset);
    return `${formatMoney(Number(v.amount) || 0, v.currency)} ${v.merchant_name || v.description || app.maps.category.get(v.category_id)?.name || ""}`.trim();
  };

  const saveOne = async (c: Card): Promise<boolean> => {
    const v = blankValues(app, c.preset);
    const res = await saveTransaction(toSaveInput(v, { source: c.preset.source ?? "text", baseCurrency: app.currency }));
    if (!res.ok) {
      const msg = res.fields ? Object.values(res.fields)[0] : res.error;
      setCards((list) => list.map((x) => (x.key === c.key ? { ...x, error: msg } : x)));
      toast.error(res.error);
      return false;
    }
    setCards((list) => list.filter((x) => x.key !== c.key));
    setAdded((a) => [line(c.preset), ...a]);
    return true;
  };

  const save = (list: Card[]) =>
    startSave(async () => {
      let ok = 0;
      for (const c of list) if (await saveOne(c)) ok += 1;
      if (ok) {
        toast.success(ok > 1 ? `${ok} transactions added` : "Added");
        router.refresh();
        setTimeout(() => document.querySelector<HTMLInputElement>('input[aria-label="Describe a transaction"]')?.focus(), 0);
      }
    });

  const setCategory = (key: number, category_id: string) =>
    setCards((list) => list.map((x) => (x.key === key ? { ...x, error: undefined, preset: { ...x.preset, category_id, subcategory_id: "" } } : x)));

  const ready = (c: Card) => Boolean(blankValues(app, c.preset).category_id);
  const allReady = cards.length > 0 && cards.every(ready);

  return (
    <div className="space-y-4">
      <DescribeInput text={text} onText={setText} onRun={run} running={reading} onReceipt={onReceipt} />

      {failedText ? (
        <button type="button" onClick={() => onEdit([{ description: failedText }])} className="text-sm text-accent underline-offset-2 hover:underline">
          Enter it in the form instead
        </button>
      ) : null}

      {cards.map((c, i) => {
        const v = blankValues(app, c.preset);
        const cat = app.maps.category.get(v.category_id);
        const sub = app.maps.subcategory.get(v.subcategory_id);
        const pay = app.maps.payment.get(v.payment_method_id);
        const who = app.maps.person.get(v.paid_by_id);
        const kind = v.type === "income" ? "income" : "expense";
        const meta = [formatDay(v.date), pay?.name, who && !who.is_self ? `Paid by ${who.name}` : null, v.trip_id ? app.maps.trip.get(v.trip_id)?.name : null].filter(Boolean);
        const first = i === 0;
        return (
          <section key={c.key} aria-label={`Transaction ${i + 1}`} className="rounded-card border border-border bg-surface-2 p-compact">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{v.merchant_name || v.description || "No merchant"}</p>
                <p className="truncate text-sm text-muted">
                  {v.type !== "expense" ? `${v.type === "income" ? "Income" : "Refund"} · ` : ""}
                  {cat ? `${cat.name}${sub ? ` › ${sub.name}` : ""}` : "No category yet"}
                </p>
              </div>
              <p className="num-lg shrink-0 text-2xl font-medium">{formatMoney(Number(v.amount) || 0, v.currency)}</p>
            </div>
            {meta.length ? <p className="mt-1 text-sm text-muted">{meta.join(" · ")}</p> : null}

            {!cat ? (
              <div className="mt-3">
                <Select aria-label="Category" value={v.category_id} onChange={(e) => setCategory(c.key, e.target.value)}>
                  <option value="">Choose a category…</option>
                  {app.categories.filter((x) => x.kind === kind && !x.archived).map((x) => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
                </Select>
              </div>
            ) : null}
            {c.error ? <p className="mt-2 text-sm text-bad">{c.error}</p> : null}

            <div className="mt-3 flex items-center gap-2">
              <Button ref={first ? saveBtn : undefined} size="md" className="flex-1" disabled={!ready(c) || saving} onClick={() => save([c])}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button variant="outline" size="md" disabled={saving} onClick={() => onEdit(cards.slice(i).map((x) => x.preset))}>
                Edit
              </Button>
              <Button variant="ghost" size="icon" aria-label="Discard" disabled={saving} onClick={() => setCards((list) => list.filter((x) => x.key !== c.key))}>
                <X size={18} />
              </Button>
            </div>
          </section>
        );
      })}

      {cards.length > 1 ? (
        <Button size="lg" className="w-full" disabled={!allReady || saving} onClick={() => save(cards)}>
          Save all ({cards.length})
        </Button>
      ) : null}

      {added.length ? (
        <ul aria-label="Added just now" className="divide-y divide-border text-sm">
          {added.map((a, i) => (
            <li key={i} className="py-2 text-muted">
              Added · <span className="text-text">{a}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
