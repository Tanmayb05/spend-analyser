"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Camera, FileUp, Link2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { useAppData } from "@/components/app-data";
import { createClient } from "@/lib/supabase/client";
import { checkPageCaps, groupByJoins, groupFiles, MAX_BATCH } from "@/lib/receipts/pages";
import { fetchDriveAction, parkReadReceiptAction, parseReceiptAction, type PageRef, type ReceiptDraft } from "@/app/(app)/receipts/actions";
import { ReceiptReview } from "./receipt-review";
import { ReceiptLink } from "./receipt-link";
import type { CardChoice } from "./card-choice";

const MAX = 10 * 1024 * 1024;
const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif";
const isoDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const sizeLabel = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

type Picked = { key: string; file: File };
type Step = "capture" | "review" | "link";
type BulkRow = { name: string; pages: number; state: "waiting" | "reading" | "parked" | "already" | "failed"; note?: string };

/**
 * Capture (camera, files, PDF, Drive link) -> "one receipt or separate?" -> read -> review -> match or create or park.
 * Several separate receipts are read and saved one after the other.
 */
export function ReceiptFlow({ onDone }: { onDone: () => void }) {
  const app = useAppData();
  const router = useRouter();
  const [step, setStep] = useState<Step>("capture");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [mode, setMode] = useState<"one" | "separate">("one");
  const [link, setLink] = useState("");
  const [queue, setQueue] = useState<Picked[][]>([]);
  const [qi, setQi] = useState(0);
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [card, setCard] = useState<CardChoice>(null);
  const [stage, setStage] = useState<string | null>(null);
  /** separate mode: file i is another page of the receipt of file i-1 */
  const [joined, setJoined] = useState<Record<string, boolean>>({});
  const [bulk, setBulk] = useState<BulkRow[] | null>(null);
  const [bulkDone, setBulkDone] = useState(false);
  const stopBulk = useRef(false);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  function add(list: FileList | null) {
    if (!list?.length) return;
    const next = [...picked];
    for (const f of Array.from(list)) {
      if (f.size > MAX) {
        toast.error(`${f.name} is larger than 10 MB.`);
        continue;
      }
      next.push({ key: crypto.randomUUID(), file: f });
    }
    setPicked(next);
  }
  const move = (i: number, d: -1 | 1) =>
    setPicked((p) => {
      const n = [...p];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });

  async function upload(files: Picked[]): Promise<PageRef[] | null> {
    const supabase = createClient();
    const out: PageRef[] = [];
    for (const [i, p] of files.entries()) {
      setStage(files.length > 1 ? `Uploading page ${i + 1} of ${files.length}…` : "Uploading…");
      const ext = p.file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      const path = `${app.userId}/uploads/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("receipts").upload(path, p.file, { contentType: p.file.type || undefined });
      if (up.error) {
        toast.error(`Upload failed: ${up.error.message}`);
        return null;
      }
      out.push({ storagePath: path, fileName: p.file.name });
    }
    return out;
  }

  /** Reads one receipt (a group of pages) and moves to review. */
  async function read(files: Picked[] | null, pages: PageRef[] | null, fileMs: number | null) {
    const refs = pages ?? (files ? await upload(files) : null);
    if (!refs) return setStage(null);
    setStage("Reading receipt…");
    const res = await parseReceiptAction({ pages: refs, fileDate: fileMs ? isoDate(fileMs) : undefined });
    setStage(null);
    if (!res.ok) return void toast.error(res.error);
    setDraft(res.draft);
    setCard(null);
    setStep("review");
    if (res.draft.cached) toast.message("Already read this receipt before, reusing it (no AI used).");
  }

  const groupsOf = () => (mode === "one" ? groupFiles(picked, "one") : groupByJoins(picked, picked.map((p) => !!joined[p.key])));

  function begin() {
    const groups = groupsOf();
    const err = groups.map((g) => checkPageCaps(g.map((p) => ({ size: p.file.size })))).find(Boolean);
    if (err) return void toast.error(err);
    if (groups.length > MAX_BATCH) return void toast.error(`Up to ${MAX_BATCH} receipts at a time.`);
    setQueue(groups);
    setQi(0);
    start(() => read(groups[0], null, groups[0][0].file.lastModified));
  }

  /** Bulk: read every receipt in turn and park it in the inbox without a review. Stops when the AI limit is reached. */
  async function readAllToInbox() {
    const groups = groupsOf();
    const err = groups.map((g) => checkPageCaps(g.map((p) => ({ size: p.file.size })))).find(Boolean);
    if (err) return void toast.error(err);
    if (groups.length > MAX_BATCH) return void toast.error(`Up to ${MAX_BATCH} receipts at a time.`);
    stopBulk.current = false;
    setBulkDone(false);
    const rows: BulkRow[] = groups.map((g) => ({ name: g[0].file.name, pages: g.length, state: "waiting" }));
    const set = (i: number, patch: Partial<BulkRow>) => {
      rows[i] = { ...rows[i], ...patch };
      setBulk([...rows]);
    };
    setBulk([...rows]);
    for (const [i, g] of groups.entries()) {
      if (stopBulk.current) break;
      set(i, { state: "reading" });
      const refs = await upload(g);
      setStage(null);
      if (!refs) {
        set(i, { state: "failed", note: "Upload failed" });
        continue;
      }
      const res = await parseReceiptAction({ pages: refs, fileDate: isoDate(g[0].file.lastModified) });
      if (!res.ok) {
        set(i, { state: "failed", note: res.error });
        if (res.fatal) {
          for (let j = i + 1; j < groups.length; j++) set(j, { state: "failed", note: "Not read" });
          break;
        }
        continue;
      }
      const park = await parkReadReceiptAction({ receiptId: res.draft.receiptId, date: res.draft.date });
      if (!park.ok) set(i, { state: "failed", note: park.error });
      else set(i, { state: park.state, note: park.state === "already" ? "Read before, left as it was" : res.draft.warnings.length ? "Totals may be off, check it" : undefined });
    }
    setBulkDone(true);
    const n = rows.filter((r) => r.state === "parked").length;
    if (n) toast.success(`${n} receipt${n === 1 ? "" : "s"} in the inbox`);
  }

  function readLink() {
    start(async () => {
      setStage("Fetching from Google Drive…");
      const res = await fetchDriveAction(link);
      if (!res.ok) {
        setStage(null);
        return void toast.error(res.error);
      }
      setQueue([]);
      await read(null, [res.page], null);
    });
  }

  /** After one receipt is saved: next in the queue, or finish. */
  function next() {
    if (qi + 1 < queue.length) {
      const n = qi + 1;
      setQi(n);
      start(() => read(queue[n], null, queue[n][0].file.lastModified));
      return;
    }
    onDone();
  }

  if (step === "review" && draft)
    return (
      <ReceiptReview
        draft={draft}
        onChange={setDraft}
        card={card}
        onCard={setCard}
        position={queue.length > 1 ? `Receipt ${qi + 1} of ${queue.length}` : null}
        onBack={() => {
          setStep("capture");
          setDraft(null);
        }}
        onNext={() => setStep("link")}
      />
    );
  if (step === "link" && draft) return <ReceiptLink draft={draft} card={card} onBack={() => setStep("review")} onSaved={next} remainingCount={queue.length - qi - 1} />;

  if (bulk) {
    const finished = bulk.filter((r) => r.state !== "waiting" && r.state !== "reading").length;
    return (
      <div className="space-y-4" data-testid="bulk-progress">
        <p role="status" className="text-sm text-muted">
          {bulkDone ? `Done: ${bulk.filter((r) => r.state === "parked").length} of ${bulk.length} in the inbox.` : `Reading ${Math.min(finished + 1, bulk.length)} of ${bulk.length}…`}
        </p>
        <ul className="divide-y divide-border rounded-control border border-border">
          {bulk.map((r, i) => (
            <li key={i} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{r.name}</p>
                <p className="text-xs text-faint">
                  {r.pages > 1 ? `${r.pages} pages` : "1 page"}
                  {r.note ? ` · ${r.note}` : ""}
                </p>
              </div>
              <span className={r.state === "failed" ? "text-xs text-bad" : "text-xs text-muted"}>
                {r.state === "reading" ? <Loader2 size={16} className="animate-spin" aria-label="Reading" /> : r.state === "parked" ? "In inbox" : r.state === "already" ? "Skipped" : r.state === "failed" ? "Failed" : "Waiting"}
              </span>
            </li>
          ))}
        </ul>
        {bulkDone ? (
          <div className="flex gap-2">
            <Button
              size="lg"
              className="flex-1"
              onClick={() => {
                onDone();
                router.push("/items?tab=inbox");
              }}
            >
              Open the inbox
            </Button>
            <Button variant="outline" size="lg" onClick={onDone}>Close</Button>
          </div>
        ) : (
          <Button variant="outline" size="lg" className="w-full" onClick={() => (stopBulk.current = true)}>Stop after this one</Button>
        )}
      </div>
    );
  }

  const grouping = picked.length > 1;
  const groupCount = grouping ? groupsOf().length : picked.length ? 1 : 0;
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted">
        Reads the shop, date, total, card and every line item. You check everything first, then link it to a transaction, create one, or keep it for later.
      </p>
      <input ref={fileInput} type="file" multiple accept={ACCEPT} className="sr-only" aria-label="Receipt files" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Take a receipt photo" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <div className="grid grid-cols-2 gap-3">
        <button type="button" disabled={pending} onClick={() => cameraInput.current?.click()} className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border px-4 py-6 text-center transition-colors hover:bg-surface-2 disabled:opacity-50">
          <Camera size={18} className="text-accent" />
          <span className="font-medium">Take a photo</span>
          <span className="text-xs text-muted">Add more for a long receipt</span>
        </button>
        <button type="button" disabled={pending} onClick={() => fileInput.current?.click()} className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border px-4 py-6 text-center transition-colors hover:bg-surface-2 disabled:opacity-50">
          <FileUp size={18} className="text-accent" />
          <span className="font-medium">Choose files</span>
          <span className="text-xs text-muted">PDF or image, up to 10 MB each</span>
        </button>
      </div>

      {picked.length ? (
        <>
          <ul className="divide-y divide-border rounded-control border border-border">
            {picked.map((p, i) => (
              <li key={p.key} className="flex items-center gap-2 px-3 py-2">
                <span className="num-lg w-5 text-sm text-faint">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{p.file.name}</p>
                  <p className="text-xs text-faint">{sizeLabel(p.file.size)}</p>
                </div>
                {grouping && mode === "separate" && i > 0 ? (
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                    <input type="checkbox" checked={!!joined[p.key]} onChange={(e) => setJoined((j) => ({ ...j, [p.key]: e.target.checked }))} aria-label={`${p.file.name} is another page of the file above`} />
                    Page of above
                  </label>
                ) : null}
                {grouping && mode === "one" ? (
                  <>
                    <button type="button" aria-label={`Move ${p.file.name} up`} disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-faint transition-colors hover:text-text disabled:opacity-30"><ArrowUp size={16} /></button>
                    <button type="button" aria-label={`Move ${p.file.name} down`} disabled={i === picked.length - 1} onClick={() => move(i, 1)} className="p-1 text-faint transition-colors hover:text-text disabled:opacity-30"><ArrowDown size={16} /></button>
                  </>
                ) : null}
                <button type="button" aria-label={`Remove ${p.file.name}`} onClick={() => {
                  setPicked((l) => l.filter((x) => x.key !== p.key));
                  setJoined((j) => ({ ...j, [p.key]: false }));
                }} className="p-1 text-faint transition-colors hover:text-bad"><X size={16} /></button>
              </li>
            ))}
          </ul>
          {grouping ? (
            <Field label="These files are" hint={mode === "one" ? "All files become pages of one receipt, in the order shown." : "Each file is its own receipt. Tick “Page of above” on a file that continues the one before it."}>
              <Segmented
                className="w-full [&>button]:flex-1"
                size="sm"
                value={mode}
                onChange={setMode}
                ariaLabel="One receipt or separate receipts"
                options={[
                  { value: "one", label: "One receipt" },
                  { value: "separate", label: "Separate receipts" },
                ]}
              />
            </Field>
          ) : null}
          <Button size="lg" className="w-full" onClick={begin} disabled={pending}>
            {pending ? "Working…" : mode === "separate" && groupCount > 1 ? `Read ${groupCount} receipts, one by one` : "Read receipt"}
          </Button>
          {mode === "separate" && groupCount > 1 ? (
            <Button size="lg" variant="outline" className="w-full" onClick={() => start(readAllToInbox)} disabled={pending}>
              Read all and review later in the inbox
            </Button>
          ) : null}
        </>
      ) : null}

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
      {stage ? (
        <p role="status" className="flex items-center justify-center gap-2 text-sm text-muted">
          <Loader2 size={16} className="animate-spin" /> {stage}
        </p>
      ) : null}
    </div>
  );
}
