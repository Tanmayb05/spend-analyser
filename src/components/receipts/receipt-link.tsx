"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Inbox, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { useAppData } from "@/components/app-data";
import { formatMoney } from "@/lib/money";
import { matchedSoFar } from "@/lib/receipts/match";
import { planLink } from "@/lib/receipts/link";
import { cn } from "@/lib/utils";
import {
  findMatchesAction,
  linkQuestionsAction,
  saveReceiptAction,
  type CandidateView,
  type LinkQuestionsView,
  type ReceiptDraft,
  type SaveReceiptInput,
} from "@/app/(app)/receipts/actions";
import type { CardChoice } from "./card-choice";

type View = "pick" | "confirm" | "create";
type Answer = {
  merchant: "receipt" | "txn" | "alias";
  currency: "receipt" | "txn";
  takeDate: boolean;
  leftoverKind: "tip" | "fee" | "";
  leftoverAmount: string;
  leftoverCategory: string;
  leftoverSub: string;
};

/** Match step: pick transactions to link (one, or several for a split order), create a new one, or park the receipt. */
export function ReceiptLink({
  draft,
  card,
  onBack,
  onSaved,
  remainingCount,
  fromInbox = false,
}: {
  draft: ReceiptDraft;
  card: CardChoice;
  onBack: () => void;
  onSaved: () => void;
  remainingCount: number;
  /** opened from the inbox: it is already parked, so there is no "keep in inbox" */
  fromInbox?: boolean;
}) {
  const app = useAppData();
  const router = useRouter();
  const [view, setView] = useState<View>("pick");
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<CandidateView[]>([]);
  const [broader, setBroader] = useState<CandidateView[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [questions, setQuestions] = useState<LinkQuestionsView[]>([]);
  const [split, setSplit] = useState(false);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [category, setCategory] = useState({ category_id: "", subcategory_id: "" });
  const [markComplete, setMarkComplete] = useState(false);
  const [pending, start] = useTransition();
  const cur = draft.currency;

  useEffect(() => {
    let live = true;
    findMatchesAction({
      date: draft.date,
      total: draft.total,
      totalPaid: draft.totalPaid && draft.totalPaid > draft.total ? draft.totalPaid : null,
      currency: cur,
      merchant: draft.merchant || null,
      paymentMethodId: draft.paymentMethodId,
      orderType: draft.orderType,
    }).then((r) => {
      if (!live) return;
      setLoading(false);
      if (!r.ok) return void toast.error(r.error);
      setCandidates(r.candidates);
      setBroader(r.broader);
    });
    return () => {
      live = false;
    };
    // the receipt fields are final once this step opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const all = [...candidates, ...broader];
  const chosen = all.filter((c) => selected.includes(c.id));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  function draftPayload(): Omit<SaveReceiptInput, "outcome"> {
    return {
      receiptId: draft.receiptId,
      merchant: draft.merchant,
      date: draft.date,
      currency: draft.currency,
      subtotal: draft.subtotal,
      tax: draft.tax,
      discount: draft.discount,
      fees: draft.fees,
      total: Number(draft.total),
      tip: draft.tip,
      tipSource: draft.tipSource,
      totalPaid: draft.totalPaid,
      cardLast4: draft.cardLast4,
      cardBrand: draft.cardBrand,
      paymentMethodId: draft.paymentMethodId,
      orderType: draft.orderType,
      orderNumber: draft.orderNumber,
      storeAddress: draft.storeAddress,
      label: draft.label,
      items: draft.items.map((i) => ({
        raw_name: i.raw_name,
        normalized_name: i.normalized_name || null,
        item_category: i.item_category || null,
        quantity: i.quantity,
        unit: i.unit,
        unit_price: i.unit_price,
        total_price: Number(i.total_price) || 0,
        list_price: i.list_price,
        line_discount: i.line_discount,
        upc: i.upc,
        tax_code: i.tax_code,
        is_weighted: i.is_weighted,
        category_id: i.category_id,
        subcategory_id: i.subcategory_id,
      })),
      card: card ? (card.mode === "existing" ? card : { mode: "new", name: card.name, issuer: card.issuer || undefined, network: card.network || undefined }) : undefined,
    };
  }

  function save(outcome: SaveReceiptInput["outcome"]) {
    start(async () => {
      const res = await saveReceiptAction({ ...draftPayload(), outcome } as SaveReceiptInput);
      if (!res.ok) return void toast.error(res.error);
      const hasExtra = outcome.type === "create" ? res.createdTxnIds.length > 1 : res.createdTxnIds.length > 0;
      const extra = hasExtra ? " and the extra transaction" : "";
      toast.success(
        res.status === "parked"
          ? "Kept in the inbox"
          : res.status === "partial"
            ? `Linked. ${formatMoney(res.matched?.remaining ?? 0, cur)} of the receipt is still unmatched`
            : res.status === "created"
              ? `Transaction created${extra}`
              : `Receipt linked${extra}`,
      );
      router.refresh();
      onSaved();
    });
  }

  function startConfirm() {
    start(async () => {
      const res = await linkQuestionsAction({
        receipt: { merchant: draft.merchant || null, date: draft.date, total: Number(draft.total), tip: draft.tip, currency: cur, paymentMethodId: draft.paymentMethodId },
        txnIds: selected,
        alreadyLinked: draft.linkedCount,
      });
      if (!res.ok) return void toast.error(res.error);
      setQuestions(res.questions);
      setSplit(res.split);
      setAnswers(
        Object.fromEntries(
          res.questions.map((q) => [
            q.txnId,
            {
              merchant: "txn",
              currency: "txn",
              takeDate: false,
              leftoverKind: q.leftover?.suggested ?? "",
              leftoverAmount: String(q.leftover?.suggestedAmount ?? q.leftover?.amount ?? ""),
              leftoverCategory: "",
              leftoverSub: "",
            } satisfies Answer,
          ]),
        ),
      );
      setCategory({ category_id: res.questions[0]?.txn.category_id ?? "", subcategory_id: res.questions[0]?.txn.subcategory_id ?? "" });
      setView("confirm");
    });
  }

  if (view === "create") return <CreatePanel draft={draft} pending={pending} onBack={() => setView("pick")} onSave={(o) => save(o)} />;

  if (view === "confirm") {
    const linkedTotal = matchedSoFar(Number(draft.total), [...questions.filter((q) => q.txn.currency === cur).map((q) => ({ amount: q.txn.amount })), { amount: draft.linkedAmount }]);
    const leftoverErrors = questions.some((q) => {
      const a = answers[q.txnId];
      return q.leftover && (!a.leftoverKind || !(Number(a.leftoverAmount) > 0) || (a.leftoverKind === "fee" && !a.leftoverCategory));
    });
    const expenseCats = app.categories.filter((c) => c.kind === "expense" && !c.archived);
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setView("pick")} className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-text">
          <ArrowLeft size={16} /> Back
        </button>
        {questions.map((q) => {
          const a = answers[q.txnId];
          const set = (patch: Partial<Answer>) => setAnswers((m) => ({ ...m, [q.txnId]: { ...m[q.txnId], ...patch } }));
          const plan = planLink(
            {
              receipt: { merchant: draft.merchant || null, date: draft.date, total: Number(draft.total), tip: draft.tip, currency: cur, payment_method_id: draft.paymentMethodId || null },
              txn: { ...q.txn, payment_method_id: null },
              split,
            },
            { merchant: a.merchant, currency: a.currency, takeDate: a.takeDate },
          );
          const changes = [
            plan.patch.date ? `date becomes ${plan.patch.date}` : null,
            plan.patch.amount != null ? `amount becomes ${formatMoney(plan.patch.amount, plan.patch.currency ?? q.txn.currency)}` : null,
            plan.patch.currency ? `currency becomes ${plan.patch.currency}` : null,
            plan.patch.merchant_name ? `merchant becomes ${plan.patch.merchant_name}` : null,
            plan.alias ? `“${plan.alias}” is remembered as another name` : null,
            draft.paymentMethodId ? `card set to ${app.maps.payment.get(draft.paymentMethodId)?.nickname || app.maps.payment.get(draft.paymentMethodId)?.name}` : null,
          ].filter(Boolean);
          return (
            <section key={q.txnId} className="space-y-3 rounded-control border border-border p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{q.txn.merchant ?? "Transaction"} · {q.txn.date}</p>
                <span className="money text-sm">{formatMoney(q.txn.amount, q.txn.currency)}</span>
              </div>
              {changes.length ? <p className="text-xs text-muted">The transaction will change: {changes.join(", ")}. Its notes stay as they are.</p> : <p className="text-xs text-muted">Nothing on the transaction needs to change.</p>}
              {q.merchant ? (
                <Field label={`The receipt says “${draft.merchant}”, the transaction says “${q.txn.merchant}”`}>
                  <Select aria-label="Merchant name to keep" value={a.merchant} onChange={(e) => set({ merchant: e.target.value as Answer["merchant"] })}>
                    <option value="txn">Keep “{q.txn.merchant}”</option>
                    <option value="receipt">Use “{draft.merchant}”</option>
                    <option value="alias">Keep “{q.txn.merchant}” and remember “{draft.merchant}” as another name</option>
                  </Select>
                </Field>
              ) : null}
              {q.currency ? (
                <Field label={`Currencies differ: receipt ${formatMoney(Number(draft.total), cur)}, transaction ${formatMoney(q.txn.amount, q.txn.currency)}`}>
                  <Select aria-label="Currency to keep" value={a.currency} onChange={(e) => set({ currency: e.target.value as Answer["currency"] })}>
                    <option value="txn">Keep the transaction as posted ({q.txn.currency})</option>
                    <option value="receipt">Use the receipt ({cur})</option>
                  </Select>
                </Field>
              ) : null}
              {split ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={a.takeDate} onChange={(e) => set({ takeDate: e.target.checked })} /> Also use the receipt date ({draft.date})
                </label>
              ) : null}
              {q.leftover ? (
                <div className="space-y-3 rounded-inset bg-surface-2 p-3">
                  <p className="text-sm">
                    This transaction is <span className="money">{formatMoney(q.leftover.amount, q.txn.currency)}</span> higher than the receipt. What is the rest?
                  </p>
                  <Segmented
                    className="w-full [&>button]:flex-1"
                    size="sm"
                    value={a.leftoverKind || "none"}
                    onChange={(v) => v !== "none" && set({ leftoverKind: v })}
                    ariaLabel="What the extra amount is"
                    options={[
                      ...(a.leftoverKind ? [] : [{ value: "none" as const, label: "Choose…" }]),
                      { value: "tip" as const, label: "Tip" },
                      { value: "fee" as const, label: "Fee or tax missing from receipt" },
                    ]}
                  />
                  {a.leftoverKind ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Amount" htmlFor={`lo-${q.txnId}`}>
                        <Input id={`lo-${q.txnId}`} type="number" inputMode="decimal" step="0.01" className="money text-right" value={a.leftoverAmount} onChange={(e) => set({ leftoverAmount: e.target.value })} />
                      </Field>
                      {a.leftoverKind === "fee" ? (
                        <Field label="Category" htmlFor={`lc-${q.txnId}`}>
                          <Select id={`lc-${q.txnId}`} value={a.leftoverCategory} onChange={(e) => set({ leftoverCategory: e.target.value, leftoverSub: "" })}>
                            <option value="">Choose…</option>
                            {expenseCats.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      ) : (
                        <p className="self-end pb-3 text-xs text-muted">Saved as its own transaction in Dining & Drinks › Tip, same date and merchant.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          );
        })}
        {!split && questions.length === 1 ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" htmlFor="lk-cat">
              <Select id="lk-cat" value={category.category_id} onChange={(e) => setCategory({ category_id: e.target.value, subcategory_id: "" })}>
                {expenseCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Subcategory" htmlFor="lk-sub">
              <Select id="lk-sub" value={category.subcategory_id} onChange={(e) => setCategory({ ...category, subcategory_id: e.target.value })}>
                <option value="">—</option>
                {app.subcategories.filter((s) => s.category_id === category.category_id && !s.archived).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}
        {split ? (
          <div className="space-y-2 text-sm">
            <p className="text-muted">
              Matched <span className="money">{formatMoney(linkedTotal.matched, cur)}</span> of <span className="money">{formatMoney(Number(draft.total), cur)}</span>. Each transaction keeps what it was charged.
            </p>
            {!linkedTotal.complete ? (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={markComplete} onChange={(e) => setMarkComplete(e.target.checked)} /> Nothing more to match, mark complete
              </label>
            ) : null}
          </div>
        ) : null}
        <Button
          size="lg"
          className="w-full"
          disabled={pending || leftoverErrors}
          onClick={() =>
            save({
              type: "link",
              links: questions.map((q) => {
                const a = answers[q.txnId];
                return {
                  txnId: q.txnId,
                  choices: { merchant: a.merchant, currency: a.currency, takeDate: a.takeDate },
                  leftover: q.leftover && a.leftoverKind ? { kind: a.leftoverKind, amount: Number(a.leftoverAmount), category_id: a.leftoverCategory, subcategory_id: a.leftoverSub } : null,
                };
              }),
              category: !split && questions.length === 1 ? category : null,
              alreadyLinked: draft.linkedCount,
              markComplete,
            })
          }
        >
          {pending ? "Saving…" : "Link receipt"}
        </Button>
      </div>
    );
  }

  const row = (c: CandidateView) => (
    <li key={c.id}>
      <label className={cn("flex cursor-pointer items-start gap-3 rounded-control border border-border p-3 transition-colors hover:bg-surface-2", selected.includes(c.id) && "bg-surface-3 ring-1 ring-inset ring-text/10")}>
        <input type="checkbox" className="mt-1" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} aria-label={`${c.merchant ?? "Transaction"} ${c.date}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium">{c.merchant ?? "No merchant"}</span>
            <span className="money text-sm">{formatMoney(c.amount, c.currency)}</span>
          </div>
          <p className="text-xs text-muted">
            {c.date}
            {c.paymentName ? ` · ${c.paymentName}` : ""}
            {c.reasons.length ? ` · ${c.reasons.join(", ")}` : ""}
          </p>
        </div>
      </label>
    </li>
  );

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-text">
        <ArrowLeft size={16} /> Back
      </button>
      <div>
        <p className="text-sm font-medium">
          {draft.merchant || "Receipt"} · {draft.date}
        </p>
        <p className="text-sm text-muted">
          <span className="money">{formatMoney(Number(draft.total), cur)}</span>
          {draft.totalPaid && draft.totalPaid !== draft.total ? <> · paid <span className="money">{formatMoney(draft.totalPaid, cur)}</span> with tip</> : null}
        </p>
      </div>
      {loading ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <Loader2 size={16} className="animate-spin" /> Looking for the transaction…
        </p>
      ) : candidates.length ? (
        <>
          <p className="text-sm text-muted">These look like this receipt. Nothing is linked until you confirm. Pick several if the order was charged in parts.</p>
          <ul className="space-y-2">{candidates.map(row)}</ul>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">No transaction matches this receipt closely.{broader.length ? " Other possibilities:" : ""}</p>
          {broader.length ? <ul className="space-y-2">{broader.map(row)}</ul> : null}
        </>
      )}
      {selected.length ? (
        <Button size="lg" className="w-full" onClick={startConfirm} disabled={pending}>
          {selected.length === 1 ? "Link to this transaction" : `Link to ${selected.length} transactions`} ({formatMoney(chosen.reduce((a, c) => a + c.amount, 0), chosen[0]?.currency ?? cur)})
        </Button>
      ) : null}
      {draft.linkedCount > 0 ? (
        <p className="text-sm text-muted">
          Already linked: <span className="money">{formatMoney(draft.linkedAmount, cur)}</span> of <span className="money">{formatMoney(Number(draft.total), cur)}</span>. Pick the transaction for the rest.
        </p>
      ) : null}
      {draft.linkedCount === 0 || !fromInbox ? (
        <div className={cn("grid gap-3", fromInbox ? "grid-cols-1" : "grid-cols-2")}>
          {draft.linkedCount === 0 ? (
            <Button variant="outline" onClick={() => setView("create")} disabled={pending}>
              <Plus size={16} /> New transaction
            </Button>
          ) : null}
          {!fromInbox ? (
            <Button variant="outline" onClick={() => save({ type: "park" })} disabled={pending}>
              <Inbox size={16} /> Keep in inbox
            </Button>
          ) : null}
        </div>
      ) : null}
      {remainingCount > 0 ? <p className="text-xs text-faint">{remainingCount} more receipt{remainingCount === 1 ? "" : "s"} after this one.</p> : null}
    </div>
  );
}

/** Create one transaction from the receipt: total as the amount, one category, optional tip as its own transaction. */
function CreatePanel({ draft, pending, onBack, onSave }: { draft: ReceiptDraft; pending: boolean; onBack: () => void; onSave: (o: SaveReceiptInput["outcome"]) => void }) {
  const app = useAppData();
  const expenseCats = app.categories.filter((c) => c.kind === "expense" && !c.archived);
  // the category most items were filed under
  const guess = useMemo(() => {
    const n = new Map<string, number>();
    for (const i of draft.items) if (i.category_id) n.set(i.category_id, (n.get(i.category_id) ?? 0) + 1);
    const top = [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    return { category_id: top, subcategory_id: draft.items.find((i) => i.category_id === top)?.subcategory_id ?? "" };
  }, [draft.items]);
  const [cat, setCat] = useState(guess);
  const [tripId, setTripId] = useState("");
  const [tip, setTip] = useState(draft.tip ? String(draft.tip) : "");
  const cur = draft.currency;

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-text">
        <ArrowLeft size={16} /> Back
      </button>
      <p className="text-sm text-muted">
        Creates one transaction for <span className="money">{formatMoney(Number(draft.total), cur)}</span> (tax included) dated {draft.date}. The items stay on the receipt.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" htmlFor="cr-cat">
          <Select id="cr-cat" value={cat.category_id} onChange={(e) => setCat({ category_id: e.target.value, subcategory_id: "" })}>
            <option value="">Choose…</option>
            {expenseCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Subcategory" htmlFor="cr-sub">
          <Select id="cr-sub" value={cat.subcategory_id} onChange={(e) => setCat({ ...cat, subcategory_id: e.target.value })}>
            <option value="">—</option>
            {app.subcategories.filter((s) => s.category_id === cat.category_id && !s.archived).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Trip" htmlFor="cr-trip">
          <Select id="cr-trip" value={tripId} onChange={(e) => setTripId(e.target.value)}>
            <option value="">None</option>
            {app.trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tip paid on top" htmlFor="cr-tip" hint={Number(tip) > 0 ? "Saved as its own Tip transaction" : "Leave empty if none"}>
          <Input id="cr-tip" type="number" inputMode="decimal" step="0.01" min="0" className="money text-right" value={tip} onChange={(e) => setTip(e.target.value)} />
        </Field>
      </div>
      <Button
        size="lg"
        className="w-full"
        disabled={pending || !cat.category_id}
        onClick={() => onSave({ type: "create", category_id: cat.category_id, subcategory_id: cat.subcategory_id, trip_id: tripId, tipAmount: Number(tip) > 0 ? Number(tip) : null })}
      >
        {pending ? "Saving…" : "Create transaction"}
      </Button>
    </div>
  );
}
