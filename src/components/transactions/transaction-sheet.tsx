"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Copy, Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { useAppData } from "@/components/app-data";
import { createClient } from "@/lib/supabase/client";
import { allCurrencies, formatMoney } from "@/lib/money";
import { formatMonth, monthStart } from "@/lib/dates";
import { buildSchedule, monthsForAmount } from "@/lib/installments";
import { cn } from "@/lib/utils";
import { deleteTransactions, restoreTransactions, saveTransaction } from "@/app/(app)/transactions/actions";
import { SmartAdd } from "@/components/ai/smart-add";
import { ReceiptFlow } from "@/components/ai/receipt-flow";
import type { PlanKind, TxnType } from "@/lib/data/types";

type FormValues = {
  id: string | null;
  date: string;
  type: TxnType;
  amount: string;
  currency: string;
  fx_rate: string;
  category_id: string;
  subcategory_id: string;
  merchant_name: string;
  description: string;
  payment_method_id: string;
  paid_by_id: string;
  trip_id: string;
  receipt_id: string;
  notes: string;
  spread: boolean;
  plan_kind: PlanKind;
  plan_months: string;
  plan_amount: string;
  plan_start: string; // YYYY-MM
  plan_touched: boolean;
};

const CURRENCIES = allCurrencies();

export function TransactionSheet() {
  const app = useAppData();
  const { txnSheet, closeTxnSheet } = app;
  const [receipt, setReceipt] = useState(false);
  const open = txnSheet.open;
  const editId = txnSheet.open ? txnSheet.id : undefined;
  const preset = txnSheet.open ? txnSheet.preset : undefined;
  const close = () => {
    setReceipt(false);
    closeTxnSheet();
  };
  const receiptMode = receipt || preset?.__receipt === "1";

  return (
    <Sheet open={open} onClose={close} title={receiptMode ? "Read a receipt" : editId ? "Edit transaction" : "Add transaction"}>
      {open && receiptMode ? <ReceiptFlow onDone={close} /> : null}
      {open && !receiptMode ? <TransactionForm key={editId ?? JSON.stringify(preset ?? {})} editId={editId} preset={preset} onReceipt={() => setReceipt(true)} /> : null}
    </Sheet>
  );
}

function blank(app: ReturnType<typeof useAppData>, preset?: Record<string, string>): FormValues {
  const self = app.people.find((p) => p.is_self);
  return {
    id: null,
    date: app.today,
    type: "expense",
    amount: "",
    currency: app.currency,
    fx_rate: "",
    category_id: "",
    subcategory_id: "",
    merchant_name: "",
    description: "",
    payment_method_id: "",
    paid_by_id: self?.id ?? "",
    trip_id: "",
    receipt_id: "",
    notes: "",
    spread: false,
    plan_kind: "spread",
    plan_months: String(app.profile.default_spread_months),
    plan_amount: "",
    plan_start: app.today.slice(0, 7),
    plan_touched: false,
    ...(preset as Partial<FormValues>),
  };
}

function TransactionForm({ editId, preset, onReceipt }: { editId?: string; preset?: Record<string, string>; onReceipt: () => void }) {
  const app = useAppData();
  const router = useRouter();
  const [v, setV] = useState<FormValues>(() => blank(app, preset));
  const [loading, setLoading] = useState(Boolean(editId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [more, setMore] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const [queue, setQueue] = useState<Record<string, string>[]>([]);
  const [source, setSource] = useState<string>(preset?.source ?? "manual");

  function applyPresets(list: Record<string, string>[], note: string | null) {
    const [first, ...rest] = list;
    setV(blank(app, first));
    setSource(first.source ?? "text");
    setQueue(rest);
    setErrors({});
    setMore(Boolean(first.description || first.trip_id));
    if (note) toast.message(note);
    if (rest.length) toast.message(`Found ${list.length} transactions. Review and save each one.`);
  }

  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const setPlan = <K extends keyof FormValues>(k: K, val: FormValues[K]) => setV((s) => ({ ...s, [k]: val, plan_touched: true }));

  // Load existing transaction
  useEffect(() => {
    if (!editId) return;
    const supabase = createClient();
    (async () => {
      const [{ data: t }, { data: plan }] = await Promise.all([
        supabase.from("transactions").select("*, merchants(name)").eq("id", editId).single(),
        supabase.from("spread_plans").select("*").eq("transaction_id", editId).maybeSingle(),
      ]);
      if (!t) {
        toast.error("Transaction not found");
        app.closeTxnSheet();
        return;
      }
      setV({
        id: t.id,
        date: t.date,
        type: t.type,
        amount: String(t.amount),
        currency: t.currency,
        fx_rate: t.currency !== app.currency ? String(t.fx_rate) : "",
        category_id: t.category_id,
        subcategory_id: t.subcategory_id ?? "",
        merchant_name: (t.merchants as { name: string } | null)?.name ?? "",
        description: t.description ?? "",
        payment_method_id: t.payment_method_id ?? "",
        paid_by_id: t.paid_by_id ?? "",
        trip_id: t.trip_id ?? "",
        receipt_id: t.receipt_id ?? "",
        notes: t.notes ?? "",
        spread: Boolean(plan),
        plan_kind: plan?.kind ?? "spread",
        plan_months: String(plan?.months ?? app.profile.default_spread_months),
        plan_amount: plan?.installment_amount ? String(plan.installment_amount) : "",
        plan_start: (plan?.start_month ?? t.date).slice(0, 7),
        plan_touched: false,
      });
      setMore(Boolean(t.payment_method_id || t.trip_id || t.notes || t.description));
      setLoading(false);
    })();
  }, [editId, app]);

  const kind = v.type === "income" ? "income" : "expense";
  const categories = useMemo(
    () => app.categories.filter((c) => c.kind === kind && (!c.archived || c.id === v.category_id)),
    [app.categories, kind, v.category_id],
  );
  const subcategories = useMemo(
    () => app.subcategories.filter((s) => s.category_id === v.category_id && (!s.archived || s.id === v.subcategory_id)),
    [app.subcategories, v.category_id, v.subcategory_id],
  );

  const amount = Number(v.amount) || 0;
  const foreign = v.currency !== app.currency;
  const baseTotal = foreign && Number(v.fx_rate) > 0 ? amount * Number(v.fx_rate) : amount;

  const schedule = useMemo(() => {
    if (!v.spread) return [];
    return buildSchedule({
      total: baseTotal,
      months: Number(v.plan_months),
      startMonth: `${v.plan_start}-01`,
      dayOfMonth: Number(v.date.slice(8, 10)) || 1,
      installmentAmount: Number(v.plan_amount) || null,
    });
  }, [v.spread, baseTotal, v.plan_months, v.plan_start, v.date, v.plan_amount]);

  function onMerchant(name: string) {
    set("merchant_name", name);
    const m = app.merchants.find((x) => x.name_key === name.trim().toLowerCase());
    if (m?.default_category_id && app.maps.category.get(m.default_category_id)?.kind === kind) {
      setV((s) => ({ ...s, merchant_name: name, category_id: m.default_category_id!, subcategory_id: m.default_subcategory_id ?? "" }));
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const plan = !v.spread
      ? null
      : editId && !v.plan_touched
        ? { unchanged: true as const }
        : {
            kind: v.plan_kind,
            months: Number(v.plan_months),
            start_month: `${v.plan_start}-01`,
            installment_amount: Number(v.plan_amount) || null,
          };

    startTransition(async () => {
      const res = await saveTransaction({
        id: v.id,
        date: v.date,
        type: v.type,
        category_id: v.category_id,
        subcategory_id: v.subcategory_id,
        merchant_name: v.merchant_name,
        description: v.description,
        amount: v.amount,
        currency: v.currency,
        fx_rate: foreign && v.fx_rate ? Number(v.fx_rate) : null,
        payment_method_id: v.payment_method_id,
        paid_by_id: v.paid_by_id,
        trip_id: v.trip_id,
        receipt_id: v.receipt_id,
        notes: v.notes,
        source: editId ? undefined : (source as "manual" | "text" | "voice"),
        plan,
      });
      if (!res.ok) {
        setErrors(res.fields ?? {});
        toast.error(res.error);
        return;
      }
      toast.success(editId ? "Saved" : "Added");
      router.refresh();
      if (queue.length) {
        applyPresets(queue, null);
        return;
      }
      app.closeTxnSheet();
    });
  }

  function remove() {
    if (!editId) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      const res = await deleteTransactions([editId]);
      if (!res.ok) return void toast.error(res.error);
      app.closeTxnSheet();
      router.refresh();
      toast("Deleted", {
        action: {
          label: "Undo",
          onClick: async () => {
            const r = await restoreTransactions(res.data);
            if (r.ok) router.refresh();
            else toast.error(r.error);
          },
        },
      });
    });
  }

  function duplicate() {
    app.openTxnSheet({
      preset: {
        type: v.type,
        amount: v.amount,
        currency: v.currency,
        category_id: v.category_id,
        subcategory_id: v.subcategory_id,
        merchant_name: v.merchant_name,
        description: v.description,
        payment_method_id: v.payment_method_id,
        paid_by_id: v.paid_by_id,
        trip_id: v.trip_id,
      },
    });
  }

  if (loading) return <div className="h-80 animate-pulse rounded-3xl bg-surface-2" />;

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {!editId ? <SmartAdd onPresets={applyPresets} onReceipt={onReceipt} /> : null}
      {queue.length ? <p className="rounded-2xl bg-accent/10 px-4 py-2 text-sm text-accent">{queue.length} more after this one</p> : null}
      <Segmented
        ariaLabel="Type"
        className="w-full [&>button]:flex-1"
        value={v.type}
        onChange={(t) => setV((s) => ({ ...s, type: t, category_id: "", subcategory_id: "" }))}
        options={[
          { value: "expense", label: "Expense" },
          { value: "income", label: "Income" },
          { value: "refund", label: "Refund" },
        ]}
      />

      {/* Amount */}
      <div>
        <div className="flex items-stretch gap-2">
          <Select aria-label="Currency" value={v.currency} onChange={(e) => set("currency", e.target.value)} className="w-28 text-sm">
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
          <input
            aria-label="Amount"
            inputMode="decimal"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            autoFocus={!editId}
            value={v.amount}
            onChange={(e) => set("amount", e.target.value)}
            className={cn(
              "num h-16 min-w-0 flex-1 rounded-2xl border bg-surface-2 px-4 text-right text-4xl font-medium outline-none focus:border-accent",
              errors.amount ? "border-bad" : "border-border",
            )}
          />
        </div>
        {errors.amount ? <p className="mt-1 text-sm text-bad">{errors.amount}</p> : null}
        {foreign ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted">
            <span>1 {v.currency} =</span>
            <Input
              aria-label="Exchange rate"
              inputMode="decimal"
              type="number"
              step="any"
              placeholder="auto"
              value={v.fx_rate}
              onChange={(e) => set("fx_rate", e.target.value)}
              className="h-9 w-28 text-sm"
            />
            <span>{app.currency}</span>
            {Number(v.fx_rate) > 0 && amount > 0 ? <span className="ml-auto">≈ {formatMoney(baseTotal, app.currency)}</span> : <span className="ml-auto text-xs">Leave blank to use that day&apos;s rate</span>}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="date" error={errors.date}>
          <Input id="date" type="date" value={v.date} onChange={(e) => set("date", e.target.value)} />
        </Field>
        <Field label="Merchant" htmlFor="merchant">
          <Input id="merchant" list="merchant-list" autoComplete="off" placeholder="e.g. Kroger" value={v.merchant_name} onChange={(e) => onMerchant(e.target.value)} />
          <datalist id="merchant-list">
            {app.merchants.map((m) => (
              <option key={m.id} value={m.name} />
            ))}
          </datalist>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" htmlFor="category" error={errors.category_id}>
          <Select id="category" value={v.category_id} onChange={(e) => setV((s) => ({ ...s, category_id: e.target.value, subcategory_id: "" }))}>
            <option value="">Choose…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Subcategory" htmlFor="subcategory">
          <Select id="subcategory" value={v.subcategory_id} onChange={(e) => set("subcategory_id", e.target.value)} disabled={!subcategories.length}>
            <option value="">{subcategories.length ? "Optional" : "—"}</option>
            {subcategories.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
      </div>

      {/* Spread / EMI */}
      {v.type === "expense" ? (
        <div className="rounded-3xl border border-border bg-surface-2 p-4">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block font-medium">Spread this cost</span>
              <span className="block text-sm text-muted">Split into monthly amounts so big purchases don&apos;t spike a month</span>
            </span>
            <input type="checkbox" className="h-6 w-6 accent-[var(--accent)]" checked={v.spread} onChange={(e) => setPlan("spread", e.target.checked)} />
          </label>

          {v.spread ? (
            <div className="mt-4 space-y-3">
              <Segmented
                size="sm"
                className="w-full [&>button]:flex-1"
                value={v.plan_kind}
                onChange={(k) => setPlan("plan_kind", k)}
                options={[
                  { value: "spread", label: "Paid upfront" },
                  { value: "emi", label: "Paying in EMIs" },
                ]}
              />
              <div className="grid grid-cols-3 gap-2">
                <Field label="Months" htmlFor="pm">
                  <Input
                    id="pm"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={360}
                    value={v.plan_months}
                    onChange={(e) => setV((s) => ({ ...s, plan_months: e.target.value, plan_amount: "", plan_touched: true }))}
                  />
                </Field>
                <Field label="Per month" htmlFor="pa">
                  <Input
                    id="pa"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    placeholder={schedule[0] ? String(schedule[0].amount) : "auto"}
                    value={v.plan_amount}
                    onChange={(e) => {
                      const per = Number(e.target.value);
                      const months = monthsForAmount(baseTotal, per);
                      setV((s) => ({ ...s, plan_amount: e.target.value, plan_months: months ? String(months) : s.plan_months, plan_touched: true }));
                    }}
                  />
                </Field>
                <Field label="Starts" htmlFor="ps">
                  <Input id="ps" type="month" value={v.plan_start} onChange={(e) => setPlan("plan_start", e.target.value)} />
                </Field>
              </div>
              <p className="text-sm text-muted">
                {schedule.length
                  ? `${formatMoney(baseTotal, app.currency)} → ${formatMoney(schedule[0].amount, app.currency)}/mo · ${formatMonth(monthStart(schedule[0].due))} – ${formatMonth(monthStart(schedule[schedule.length - 1].due))}`
                  : "Enter an amount and number of months."}
              </p>
              <p className="text-xs text-faint">
                {v.plan_kind === "spread"
                  ? "Paid upfront: cash view shows the full amount on the purchase date; normalized view spreads it."
                  : "EMI: each installment counts in the month it's due, in both views."}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* More details */}
      <button type="button" onClick={() => setMore((m) => !m)} className="flex w-full items-center justify-between text-sm text-muted">
        More details (payment, trip, notes)
        <ChevronDown size={18} className={cn("transition", more && "rotate-180")} />
      </button>
      {more ? (
        <div className="space-y-3">
          <Field label="Description" htmlFor="desc">
            <Input id="desc" value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="What was it for?" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment" htmlFor="pay">
              <Select id="pay" value={v.payment_method_id} onChange={(e) => set("payment_method_id", e.target.value)}>
                <option value="">—</option>
                {app.paymentMethods.filter((p) => !p.archived || p.id === v.payment_method_id).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Paid by" htmlFor="paidby">
              <Select id="paidby" value={v.paid_by_id} onChange={(e) => set("paid_by_id", e.target.value)}>
                <option value="">—</option>
                {app.people.filter((p) => !p.archived || p.id === v.paid_by_id).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Trip" htmlFor="trip" hint={v.trip_id ? tripHint(app.maps.trip.get(v.trip_id)?.include_mode) : undefined}>
            <Select id="trip" value={v.trip_id} onChange={(e) => set("trip_id", e.target.value)}>
              <option value="">Not part of a trip</option>
              {app.trips.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Notes" htmlFor="notes">
            <Textarea id="notes" value={v.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>
      ) : null}

      <div className="flex gap-2 pt-1">
        {editId ? (
          <>
            <Button variant="danger" size="icon" onClick={remove} aria-label={confirmDelete ? "Tap again to delete" : "Delete"} title="Delete" className={cn(confirmDelete && "w-auto px-4")}>
              <Trash2 size={18} />
              {confirmDelete ? "Tap again" : null}
            </Button>
            <Button variant="outline" size="icon" onClick={duplicate} aria-label="Duplicate" title="Duplicate">
              <Copy size={18} />
            </Button>
          </>
        ) : null}
        <Button type="submit" size="lg" className="flex-1" disabled={pending}>
          {pending ? "Saving…" : editId ? "Save changes" : queue.length ? "Add & next" : "Add"}
        </Button>
      </div>
    </form>
  );
}

function tripHint(mode?: string) {
  if (mode === "excluded") return "This trip isn't counted in your monthly spending (change on the Trips page).";
  if (mode === "lump_sum") return "This trip counts as one lump sum.";
  return "Counts in your monthly spending.";
}
