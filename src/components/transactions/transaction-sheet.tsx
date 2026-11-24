"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Copy, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { useAppData } from "@/components/app-data";
import { createClient } from "@/lib/supabase/client";
import { allCurrencies, formatMoney } from "@/lib/money";
import { formatDay, formatMonth, monthStart } from "@/lib/dates";
import { buildSchedule, monthsForAmount } from "@/lib/installments";
import { DEFAULT_BIWEEKLY, MAX_BIWEEKLY, biweeklyDates } from "@/lib/biweekly";
import { parseISO, toISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { deleteTransactions, restoreTransactions, saveTransaction } from "@/app/(app)/transactions/actions";
import { AiEntry } from "@/components/ai/ai-entry";
import { Chip } from "@/components/ui/chip";
import { blankValues, toSaveInput, type FormValues } from "@/components/transactions/entry-model";
import { parseEntryMethod, resolveEntryMode, type EntryMethod } from "@/lib/entry-mode";
import type { TxnPreset } from "@/app/(app)/ai/actions";
import { ReceiptFlow } from "@/components/receipts/receipt-flow";

const CURRENCIES = allCurrencies();

export function TransactionSheet() {
  const app = useAppData();
  const { txnSheet, closeTxnSheet } = app;
  // These belong to one opening of the sheet: each opening is a new txnSheet object, so they reset by themselves.
  const [receipt, setReceipt] = useState<object | null>(null);
  const [switched, setSwitched] = useState<{ sheet: object; method: EntryMethod } | null>(null);
  const [handoff, setHandoff] = useState<{ sheet: object; presets: TxnPreset[] } | null>(null);
  const open = txnSheet.open;
  const editId = txnSheet.open ? txnSheet.id : undefined;
  const preset = txnSheet.open ? txnSheet.preset : undefined;
  const close = () => {
    setReceipt(null);
    closeTxnSheet();
  };

  const override = switched?.sheet === txnSheet ? switched.method : null;
  const mine = handoff?.sheet === txnSheet ? handoff.presets : null;
  const mode = resolveEntryMode({ editId, preset, defaultMethod: parseEntryMethod(app.profile.default_entry_method), aiReady: app.aiReady, override });
  const receiptMode = receipt === txnSheet || mode === "receipt";
  const formMode = Boolean(mine) || mode === "manual";
  // The AI / form switch only makes sense for a plain new entry.
  const canSwitch = open && !editId && !receiptMode && app.aiReady && !(preset && Object.keys(preset).length > 0);
  const [first, ...rest] = mine ?? [];

  return (
    <Sheet open={open} onClose={close} title={receiptMode ? "Read a receipt" : editId ? "Edit transaction" : "Add transaction"}>
      {open && canSwitch ? (
        <Segmented
          ariaLabel="Entry method"
          className="mb-4 w-full [&>button]:flex-1"
          value={formMode ? "manual" : "ai"}
          onChange={(method) => {
            setHandoff(null);
            setSwitched({ sheet: txnSheet, method });
          }}
          options={[
            { value: "ai", label: "Describe it" },
            { value: "manual", label: "Form" },
          ]}
        />
      ) : null}
      {open && receiptMode ? <ReceiptFlow onDone={close} /> : null}
      {open && !receiptMode && !formMode ? (
        <AiEntry
          onReceipt={() => setReceipt(txnSheet)}
          onEdit={(presets) => setHandoff({ sheet: txnSheet, presets })}
        />
      ) : null}
      {open && !receiptMode && formMode ? (
        <TransactionForm
          onReceipt={() => setReceipt(txnSheet)}
          key={editId ?? JSON.stringify(mine ?? preset ?? {})}
          editId={editId}
          preset={first ?? preset}
          initialQueue={rest}
        />
      ) : null}
    </Sheet>
  );
}

const blank = blankValues;

function TransactionForm({ editId, preset, initialQueue, onReceipt }: { editId?: string; preset?: Record<string, string>; initialQueue?: Record<string, string>[]; onReceipt?: () => void }) {
  const app = useAppData();
  const router = useRouter();
  const [v, setV] = useState<FormValues>(() => blank(app, preset));
  const [loading, setLoading] = useState(Boolean(editId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  // rarely used parts stay folded unless the entry already uses them
  const [more, setMore] = useState(() => Boolean(v.description || v.trip_id || v.notes || v.external_url));
  const [allCats, setAllCats] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [advanced, setAdvanced] = useState(() => v.spread || v.repeat);
  const amountRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const [queue, setQueue] = useState<Record<string, string>[]>(() => initialQueue ?? []);
  const [source, setSource] = useState<string>(preset?.source ?? "manual");

  function applyPresets(list: Record<string, string>[], note: string | null) {
    const [first, ...rest] = list;
    const next = blank(app, first);
    setV(next);
    setSource(first.source ?? "text");
    setQueue(rest);
    setErrors({});
    setMore(Boolean(first.description || first.trip_id || first.notes));
    setAdvanced(next.spread || next.repeat);
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
        external_url: t.external_url ?? "",
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
        repeat: false,
        repeat_count: String(DEFAULT_BIWEEKLY),
      });
      setMore(Boolean(t.trip_id || t.notes || t.description || t.external_url));
      setAdvanced(Boolean(plan));
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
  const linkHref = safeHttpUrl(v.external_url);

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

  const repeating = !editId && v.type === "income" && v.repeat;
  const paychecks = useMemo(() => {
    const n = Number(v.repeat_count);
    return repeating && Number.isInteger(n) && n >= 2 && n <= MAX_BIWEEKLY ? biweeklyDates(v.date, n) : [];
  }, [repeating, v.repeat_count, v.date]);

  /** Picking a known merchant fills what you used last time: category, payment method and who paid. */
  function onMerchant(name: string) {
    const m = app.merchants.find((x) => x.name_key === name.trim().toLowerCase());
    const last = m ? app.entryHints.lastByMerchant[m.id] : undefined;
    const catId = m?.default_category_id ?? last?.category_id ?? null;
    const catOk = catId && app.maps.category.get(catId)?.kind === kind;
    const subId = m?.default_category_id ? m.default_subcategory_id : last?.subcategory_id;
    const pay = last?.payment_method_id ? app.paymentMethods.find((p) => p.id === last.payment_method_id && !p.archived) : undefined;
    const who = last?.paid_by_id ? app.people.find((p) => p.id === last.paid_by_id && !p.archived) : undefined;
    setV((s) => ({
      ...s,
      merchant_name: name,
      ...(m && catOk ? { category_id: catId, subcategory_id: subId ?? "" } : {}),
      ...(m && pay ? { payment_method_id: pay.id } : {}),
      ...(m && who ? { paid_by_id: who.id } : {}),
    }));
  }

  function submit(e?: React.FormEvent, again = false) {
    e?.preventDefault();
    setErrors({});
    startTransition(async () => {
      const res = await saveTransaction(toSaveInput(v, { editId, source, baseCurrency: app.currency }));
      if (!res.ok) {
        setErrors(res.fields ?? {});
        toast.error(res.error);
        return;
      }
      toast.success(editId ? "Saved" : res.data.created > 1 ? `${res.data.created} paychecks added` : "Added");
      router.refresh();
      if (queue.length) {
        applyPresets(queue, null);
        return;
      }
      if (again) {
        // keep what repeats between entries (type, date, currency, payment, payer); clear the rest
        setV({ ...blank(app), type: v.type, date: v.date, currency: v.currency, payment_method_id: v.payment_method_id, paid_by_id: v.paid_by_id });
        setSource("manual");
        setMore(false);
        setAdvanced(false);
        amountRef.current?.focus();
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
        external_url: v.external_url,
        payment_method_id: v.payment_method_id,
        paid_by_id: v.paid_by_id,
        trip_id: v.trip_id,
      },
    });
  }

  // Recently used first (what you entered last is most likely what you enter next); frequent ones and then the rest fill any gap.
  const quickCats = useMemo(() => {
    const byId = (ids: string[]) => ids.map((id) => categories.find((c) => c.id === id)).filter((c): c is (typeof categories)[number] => Boolean(c));
    const pool = [...new Set([...byId(app.entryHints.recentCategories[kind]), ...byId(app.entryHints.topCategories[kind]), ...categories])];
    const top = pool.slice(0, 6);
    const sel = categories.find((c) => c.id === v.category_id);
    return sel && !top.includes(sel) ? [...top.slice(0, 5), sel] : top;
  }, [app.entryHints, categories, kind, v.category_id]);
  const { merchants, entryHints } = app;
  const quickMerchants = useMemo(
    () => entryHints.recentMerchants.map((id) => merchants.find((m) => m.id === id)).filter((m): m is (typeof merchants)[number] => Boolean(m)).slice(0, 5),
    [entryHints, merchants],
  );
  const yesterday = useMemo(() => {
    const d = parseISO(app.today);
    d.setDate(d.getDate() - 1);
    return toISO(d);
  }, [app.today]);
  const customDate = v.date !== app.today && v.date !== yesterday;
  const pm = app.maps.payment.get(v.payment_method_id);
  const payer = app.maps.person.get(v.paid_by_id);

  if (loading)
    return (
      <p role="status" className="flex h-40 items-center justify-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Loading transaction
      </p>
    );

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {queue.length ? <p className="rounded-inset border border-border bg-surface-2 px-4 py-2 text-sm text-text">{queue.length} more after this one</p> : null}
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
          <Select aria-label="Currency" value={v.currency} onChange={(e) => set("currency", e.target.value)} className="h-16 w-28 text-lg font-medium">
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
            ref={amountRef}
            autoFocus={!editId}
            value={v.amount}
            onChange={(e) => set("amount", e.target.value)}
            className={cn(
              "money h-16 min-w-0 flex-1 rounded-control border bg-surface-2 px-4 text-right text-3xl font-medium outline-none transition-colors placeholder:text-faint focus:border-accent",
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

      {/* Category: the one choice every entry needs, so the usual ones are a tap away */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-text">Category <span className="font-normal text-faint">· recent first</span></p>
        <div role="group" aria-label="Recent categories" className="flex flex-wrap gap-2">
          {quickCats.map((c) => (
            <Chip key={c.id} selected={v.category_id === c.id} onClick={() => setV((s) => ({ ...s, category_id: c.id, subcategory_id: "" }))}>
              {c.name}
            </Chip>
          ))}
          {categories.length > quickCats.length ? (
            <Chip selected={allCats} aria-label="More categories" onClick={() => setAllCats((a) => !a)}>
              More
            </Chip>
          ) : null}
        </div>
        {allCats || !quickCats.length ? (
          <Select id="category" aria-label="Category" value={v.category_id} onChange={(e) => setV((s) => ({ ...s, category_id: e.target.value, subcategory_id: "" }))}>
            <option value="">Choose…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        ) : null}
        {errors.category_id ? <p className="text-sm text-bad">{errors.category_id}</p> : null}
      </div>

      {subcategories.length ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-text">Subcategory (optional)</p>
          <div role="group" aria-label="Subcategories" className="flex flex-wrap gap-2">
            {subcategories.map((sc) => (
              <Chip key={sc.id} selected={v.subcategory_id === sc.id} onClick={() => set("subcategory_id", v.subcategory_id === sc.id ? "" : sc.id)}>
                {sc.name}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      <Field label="Merchant" htmlFor="merchant">
        <Input id="merchant" list="merchant-list" autoComplete="off" placeholder="e.g. Kroger" value={v.merchant_name} onChange={(e) => onMerchant(e.target.value)} />
        <datalist id="merchant-list">
          {app.merchants.map((m) => (
            <option key={m.id} value={m.name} />
          ))}
        </datalist>
        {!v.merchant_name && quickMerchants.length ? (
          <div role="group" aria-label="Recent merchants" className="flex flex-wrap gap-2">
            {quickMerchants.map((m) => (
              <Chip key={m.id} onClick={() => onMerchant(m.name)}>{m.name}</Chip>
            ))}
          </div>
        ) : null}
      </Field>

      <Field label="Date" htmlFor="date" error={errors.date}>
        <div role="group" aria-label="Date shortcuts" className="flex flex-wrap gap-2">
          <Chip selected={v.date === app.today} onClick={() => { set("date", app.today); setDateOpen(false); }}>Today</Chip>
          <Chip selected={v.date === yesterday} onClick={() => { set("date", yesterday); setDateOpen(false); }}>Yesterday</Chip>
          <Chip selected={customDate || dateOpen} aria-label="Pick date" onClick={() => setDateOpen(true)}>
            {customDate ? formatDay(v.date) : "Pick date"}
          </Chip>
        </div>
        {dateOpen || customDate ? <Input id="date" type="date" value={v.date} onChange={(e) => set("date", e.target.value)} /> : null}
      </Field>

      {/* Paid with: shown as one line, changed only when it differs from the default */}
      <div className="space-y-4">
        <button
          type="button"
          aria-expanded={payOpen}
          onClick={() => setPayOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 rounded-control border border-border bg-surface-2 px-4 py-3 text-left text-sm transition-colors hover:bg-surface-3"
        >
          <span className="min-w-0 truncate">
            <span className="text-muted">Paid with </span>
            <span className="text-text">{pm?.name ?? "no payment method"}</span>
            {payer ? <span className="text-muted"> · by {payer.name}</span> : null}
          </span>
          <span className="shrink-0 text-muted">Change</span>
        </button>
        {payOpen ? (
          <div className="grid grid-cols-2 gap-4">
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
        ) : null}
      </div>

      {editId && linkHref ? (
        <a
          href={linkHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-control border border-border bg-surface-2 px-4 py-3 transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-inset bg-surface-3 text-accent">
            <ExternalLink size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Related link</span>
            <span className="block truncate text-xs text-muted">{linkHref}</span>
          </span>
          <span className="shrink-0 text-sm font-medium text-accent">Open</span>
        </a>
      ) : null}


      {/* Spread / repeat: rare, so folded */}
      {v.type === "expense" || (v.type === "income" && !editId) ? (
        <div className="space-y-6">
          <button type="button" aria-expanded={advanced} onClick={() => setAdvanced((a) => !a)} className="flex w-full items-center justify-between rounded-control py-1 text-sm text-muted transition-colors hover:text-text">
            {v.type === "expense" ? "Spread this cost over months" : "Repeat as bi-weekly paychecks"}
            <ChevronDown size={18} className={cn("transition-transform duration-(--dur-fast)", advanced && "rotate-180")} />
          </button>
          {advanced ? (
            <>
      {/* Spread / EMI */}
      {v.type === "expense" ? (
        <div className="rounded-card border border-border bg-surface-2 p-compact">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block font-medium">Spread this cost</span>
              <span className="block text-sm text-muted">Split into monthly amounts so big purchases don&apos;t spike a month</span>
            </span>
            <input type="checkbox" className="h-6 w-6 accent-[var(--accent)]" checked={v.spread} onChange={(e) => setPlan("spread", e.target.checked)} />
          </label>

          {v.spread ? (
            <div className="mt-4 space-y-4">
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
              <div className="grid grid-cols-3 gap-3">
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
                  : "Enter an amount and number of months"}
              </p>
              <p className="text-xs text-faint">
                {v.plan_kind === "spread"
                  ? "Paid upfront: you pay it all now, but it counts a bit each month"
                  : "EMI: each installment counts in the month it's due"}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Bi-weekly income */}
      {v.type === "income" && !editId ? (
        <div className="rounded-card border border-border bg-surface-2 p-compact">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block font-medium">Repeats bi-weekly</span>
              <span className="block text-sm text-muted">A paycheck every 2 weeks, starting on the date above</span>
            </span>
            <input type="checkbox" className="h-6 w-6 accent-[var(--accent)]" checked={v.repeat} onChange={(e) => set("repeat", e.target.checked)} />
          </label>
          {v.repeat ? (
            <div className="mt-4 space-y-4">
              <Field label="Number of paychecks" htmlFor="rc" error={errors.repeat} hint={`26 is a full year. Up to ${MAX_BIWEEKLY}.`}>
                <Input id="rc" type="number" inputMode="numeric" min={2} max={MAX_BIWEEKLY} value={v.repeat_count} onChange={(e) => set("repeat_count", e.target.value)} />
              </Field>
              <p className="text-sm text-muted">
                {paychecks.length
                  ? `${paychecks.length} × ${formatMoney(baseTotal, app.currency)} · ${formatDay(paychecks[0])} – ${formatDay(paychecks[paychecks.length - 1])}`
                  : "Enter a whole number of paychecks"}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {/* More details */}
      <button type="button" onClick={() => setMore((m) => !m)} className="flex w-full items-center justify-between rounded-control py-1 text-sm text-muted transition-colors hover:text-text">
        More details (description, link, trip, notes)
        <ChevronDown size={18} className={cn("transition-transform duration-(--dur-fast)", more && "rotate-180")} />
      </button>
      {more ? (
        <div className="space-y-4">
          <Field label="Description" htmlFor="desc">
            <Input id="desc" value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="What was it for?" />
          </Field>
          <Field label="Link" htmlFor="external-url" error={errors.external_url} hint="Add a receipt, order, booking or other related webpage">
            <div className="flex gap-2">
              <Input
                id="external-url"
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                value={v.external_url}
                onChange={(e) => set("external_url", e.target.value)}
                placeholder="https://example.com/order"
              />
              {linkHref ? (
                <a
                  href={linkHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open link"
                  title="Open link"
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-control border border-border bg-surface-2 text-text transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <ExternalLink size={18} />
                </a>
              ) : null}
            </div>
          </Field>
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
        {!editId && !queue.length ? (
          <Button variant="outline" size="lg" disabled={pending} onClick={() => submit(undefined, true)}>
            Add &amp; another
          </Button>
        ) : null}
        <Button type="submit" size="lg" className="flex-1" disabled={pending}>
          {pending ? "Saving…" : editId ? "Save changes" : queue.length ? "Add & next" : "Add"}
        </Button>
      </div>
      {!editId && app.aiReady && onReceipt ? (
        <button type="button" onClick={onReceipt} className="text-sm text-accent underline-offset-2 hover:underline">
          Read a receipt instead
        </button>
      ) : null}
    </form>
  );
}

function tripHint(mode?: string) {
  if (mode === "excluded") return "This trip isn't counted in your monthly spending (change on the Trips page).";
  if (mode === "lump_sum") return "This trip counts as one lump sum.";
  return "Counts in your monthly spending.";
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname ? url.href : null;
  } catch {
    return null;
  }
}
