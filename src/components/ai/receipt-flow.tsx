"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, FileUp, Link2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { useAppData } from "@/components/app-data";
import { createClient } from "@/lib/supabase/client";
import { allCurrencies, formatMoney } from "@/lib/money";
import { round2 } from "@/lib/utils";
import { parseReceiptAction, saveReceiptAction, type ReceiptDraft } from "@/app/(app)/ai/actions";

const MAX = 10 * 1024 * 1024;
const CURRENCIES = allCurrencies();

/** Upload / photo / Drive link → Gemini extraction → review → save as one or split transactions. */
export function ReceiptFlow({ onDone }: { onDone: () => void }) {
  const app = useAppData();
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [link, setLink] = useState("");
  const [stage, setStage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  function readFile(file: File) {
    if (file.size > MAX) return void toast.error("File is larger than 10 MB.");
    start(async () => {
      setStage("Uploading…");
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      const path = `${app.userId}/uploads/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("receipts").upload(path, file, { contentType: file.type || undefined });
      if (up.error) {
        setStage(null);
        return void toast.error(`Upload failed: ${up.error.message}`);
      }
      setStage("Reading receipt…");
      const res = await parseReceiptAction({ storagePath: path, fileName: file.name });
      setStage(null);
      if (!res.ok) return void toast.error(res.error);
      setDraft(res.draft);
      if (res.draft.cached) toast.message("Already read this receipt before, reusing it (no AI used).");
    });
  }

  function readLink() {
    start(async () => {
      setStage("Fetching from Google Drive…");
      const res = await parseReceiptAction({ driveUrl: link });
      setStage(null);
      if (!res.ok) return void toast.error(res.error);
      setDraft(res.draft);
      if (res.draft.cached) toast.message("Already read this receipt before, reusing it (no AI used).");
    });
  }

  if (draft) return <ReceiptReview draft={draft} onChange={setDraft} onDone={onDone} />;

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted">
        AI reads the shop, date, total and every line item. You check everything before it&apos;s saved, and the items are kept on the Items page so you can track prices over time.
      </p>
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif"
        className="sr-only"
        aria-label="Receipt file"
        onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => fileInput.current?.click()}
        className="flex w-full flex-col items-center gap-2 rounded-3xl border border-dashed border-border px-6 py-8 text-center hover:bg-surface-2 disabled:opacity-50"
      >
        <FileUp className="text-accent" />
        <span className="font-medium">Upload or take a photo</span>
        <span className="text-xs text-muted">PDF, JPG, PNG, WEBP or HEIC · up to 10 MB</span>
      </button>
      <div className="flex items-center gap-3 text-xs text-faint">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (link.trim()) readLink();
        }}
      >
        <Field label="Google Drive link" htmlFor="dl" hint="Sharing must be set to “Anyone with the link”.">
          <div className="flex gap-2">
            <Input id="dl" inputMode="url" placeholder="https://drive.google.com/file/d/…" value={link} onChange={(e) => setLink(e.target.value)} />
            <Button type="submit" disabled={!link.trim() || pending}>
              <Link2 size={16} /> Read
            </Button>
          </div>
        </Field>
      </form>
      {stage ? <p className="animate-pulse text-center text-sm text-muted">{stage}</p> : null}
    </div>
  );
}

function ReceiptReview({ draft, onChange, onDone }: { draft: ReceiptDraft; onChange: (d: ReceiptDraft) => void; onDone: () => void }) {
  const app = useAppData();
  const router = useRouter();
  const expenseCats = app.categories.filter((c) => c.kind === "expense" && !c.archived);
  const distinctCats = new Set(draft.items.map((i) => i.category_id).filter(Boolean));
  const [mode, setMode] = useState<"single" | "split">(distinctCats.size > 1 ? "split" : "single");
  const firstCat = draft.items.find((i) => i.category_id)?.category_id ?? "";
  const [single, setSingle] = useState({ category_id: firstCat, subcategory_id: draft.items.find((i) => i.category_id === firstCat)?.subcategory_id ?? "" });
  const [tripId, setTripId] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [pending, start] = useTransition();

  const itemsSum = round2(draft.items.reduce((a, i) => a + (Number(i.total_price) || 0), 0));
  const expected = round2((draft.subtotal ?? itemsSum) - 0);
  const mismatch = draft.items.length > 0 && draft.subtotal != null && Math.abs(itemsSum - expected) > 0.05;
  const set = <K extends keyof ReceiptDraft>(k: K, v: ReceiptDraft[K]) => onChange({ ...draft, [k]: v });
  const setItem = (idx: number, patch: Partial<ReceiptDraft["items"][number]>) =>
    onChange({ ...draft, items: draft.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });

  function save() {
    start(async () => {
      const res = await saveReceiptAction({
        receiptId: draft.receiptId,
        merchant: draft.merchant,
        date: draft.date,
        currency: draft.currency,
        total: Number(draft.total),
        mode,
        single: mode === "single" ? single : undefined,
        trip_id: tripId,
        payment_method_id: paymentId,
        items: draft.items.map((i) => ({
          raw_name: i.raw_name,
          normalized_name: i.normalized_name || null,
          item_category: i.item_category || null,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.unit_price,
          total_price: Number(i.total_price) || 0,
          category_id: i.category_id,
          subcategory_id: i.subcategory_id,
        })),
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.count === 1 ? "Receipt saved" : `Saved as ${res.count} transactions`);
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">{draft.items.length} items found. Check and fix anything wrong.</p>
        {draft.fileUrl ? (
          <a href={draft.fileUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-sm text-accent">
            View file <ExternalLink size={14} />
          </a>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Merchant" htmlFor="rm"><Input id="rm" value={draft.merchant} onChange={(e) => set("merchant", e.target.value)} /></Field>
        <Field label="Date" htmlFor="rd"><Input id="rd" type="date" value={draft.date} onChange={(e) => set("date", e.target.value)} /></Field>
        <Field label="Currency" htmlFor="rc">
          <Select id="rc" value={draft.currency} onChange={(e) => set("currency", e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Total paid" htmlFor="rt">
          <Input id="rt" type="number" inputMode="decimal" step="0.01" value={draft.total} onChange={(e) => set("total", Number(e.target.value))} className="num text-right" />
        </Field>
      </div>
      <p className="text-xs text-muted">
        Items {formatMoney(itemsSum, draft.currency)}
        {draft.tax ? ` · tax ${formatMoney(draft.tax, draft.currency)}` : ""}
        {draft.discount ? ` · savings ${formatMoney(draft.discount, draft.currency)}` : ""}
      </p>
      {mismatch ? (
        <p className="flex items-center gap-2 rounded-2xl bg-warn/10 px-3 py-2 text-xs text-warn">
          <AlertTriangle size={14} /> Items add up to {formatMoney(itemsSum, draft.currency)} but the subtotal says {formatMoney(expected, draft.currency)}. A line may be missing.
        </p>
      ) : null}

      <Segmented
        className="w-full [&>button]:flex-1"
        size="sm"
        value={mode}
        onChange={setMode}
        options={[
          { value: "single", label: "One transaction" },
          { value: "split", label: "Split by category" },
        ]}
      />
      {mode === "single" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" htmlFor="sc">
            <Select id="sc" value={single.category_id} onChange={(e) => setSingle({ category_id: e.target.value, subcategory_id: "" })}>
              <option value="">Choose…</option>
              {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Subcategory" htmlFor="ss">
            <Select id="ss" value={single.subcategory_id} onChange={(e) => setSingle({ ...single, subcategory_id: e.target.value })}>
              <option value="">—</option>
              {app.subcategories.filter((s) => s.category_id === single.category_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        </div>
      ) : (
        <p className="text-xs text-muted">Tax and savings are shared across categories in proportion to their items.</p>
      )}

      <ul className="max-h-80 space-y-2 overflow-y-auto">
        {draft.items.map((it, idx) => (
          <li key={idx} className="rounded-2xl bg-surface-2 p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <input
                  aria-label={`Item ${idx + 1} name`}
                  value={it.normalized_name}
                  onChange={(e) => setItem(idx, { normalized_name: e.target.value })}
                  className="w-full bg-transparent text-sm font-medium outline-none"
                />
                <p className="truncate text-xs text-faint">
                  {it.raw_name}
                  {it.quantity ? ` · ${it.quantity}${it.unit ? ` ${it.unit}` : ""}` : ""}
                  {it.unit_price ? ` @ ${formatMoney(it.unit_price, draft.currency)}` : ""}
                </p>
              </div>
              <input
                aria-label={`Item ${idx + 1} price`}
                type="number"
                inputMode="decimal"
                step="0.01"
                value={it.total_price}
                onChange={(e) => setItem(idx, { total_price: Number(e.target.value) })}
                className="num w-20 rounded-lg bg-surface-3 px-2 py-1 text-right text-sm outline-none"
              />
              <button type="button" aria-label={`Remove item ${idx + 1}`} onClick={() => onChange({ ...draft, items: draft.items.filter((_, i) => i !== idx) })} className="p-1 text-faint hover:text-bad">
                <Trash2 size={14} />
              </button>
            </div>
            {mode === "split" ? (
              <select
                aria-label={`Item ${idx + 1} category`}
                value={it.category_id}
                onChange={(e) => setItem(idx, { category_id: e.target.value, subcategory_id: "" })}
                className="mt-2 h-8 w-full rounded-lg border border-border bg-surface-3 px-2 text-xs"
              >
                <option value="">Category…</option>
                {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Trip" htmlFor="rtp">
          <Select id="rtp" value={tripId} onChange={(e) => setTripId(e.target.value)}>
            <option value="">None</option>
            {app.trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Payment" htmlFor="rpm">
          <Select id="rpm" value={paymentId} onChange={(e) => setPaymentId(e.target.value)}>
            <option value="">—</option>
            {app.paymentMethods.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
      </div>
      <Button size="lg" className="w-full" onClick={save} disabled={pending || !(draft.total > 0)}>
        {pending ? "Saving…" : `Save ${formatMoney(Number(draft.total) || 0, draft.currency)}`}
      </Button>
    </div>
  );
}
