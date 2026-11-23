"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useAppData } from "@/components/app-data";
import { useAction } from "@/hooks/use-action";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { deleteTrip, refreshTripCover, removeTripCover, saveTrip, setTripCoverUpload } from "@/app/(app)/trips/actions";
import type { Trip, TripMode } from "@/lib/data/types";
import { MODE_COPY } from "@/lib/trip-modes";


export function ModePicker({ value, onChange }: { value: TripMode; onChange: (m: TripMode) => void }) {
  return (
    <div role="radiogroup" aria-label="Count this trip in monthly spending" className="grid gap-2">
      {(Object.keys(MODE_COPY) as TripMode[]).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={value === m}
          onClick={() => onChange(m)}
          className={cn("flex items-baseline justify-between gap-4 rounded-control border px-3 py-2.5 text-left transition-colors duration-(--dur-fast)", value === m ? "border-accent bg-surface-3" : "border-border bg-surface-2 hover:bg-surface-3")}
        >
          <span className="shrink-0 text-sm font-medium">{MODE_COPY[m].title}</span>
          <span className="text-right text-xs text-muted">{MODE_COPY[m].body}</span>
        </button>
      ))}
    </div>
  );
}

export function TripForm({ trip, onDone }: { trip?: Trip; onDone?: (id?: string) => void }) {
  const [askDelete, setAskDelete] = useState(false);
  const app = useAppData();
  const router = useRouter();
  const travel = app.categories.find((c) => c.name.toLowerCase() === "travel" && c.kind === "expense");
  const [v, setV] = useState({
    name: trip?.name ?? "",
    destination: trip?.destination ?? "",
    start_date: trip?.start_date ?? "",
    end_date: trip?.end_date ?? "",
    budget: trip?.budget != null ? String(trip.budget) : "",
    include_mode: (trip?.include_mode ?? "excluded") as TripMode,
    lump_date: trip?.lump_date ?? "",
    lump_category_id: trip?.lump_category_id ?? travel?.id ?? "",
    lump_spread_months: trip?.lump_spread_months ? String(trip.lump_spread_months) : "",
    notes: trip?.notes ?? "",
  });
  const [confirm, setConfirm] = useState<null | "keep" | "all">(null);
  const a = useAction();

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await saveTrip({
          id: trip?.id,
          name: v.name,
          destination: v.destination || null,
          start_date: v.start_date || null,
          end_date: v.end_date || null,
          budget: v.budget ? Number(v.budget) : null,
          include_mode: v.include_mode,
          lump_date: v.lump_date || null,
          lump_category_id: v.lump_category_id || null,
          lump_spread_months: v.lump_spread_months ? Number(v.lump_spread_months) : null,
          notes: v.notes || null,
        });
        if (!res.ok) return void toast.error(res.error);
        toast.success(res.message);
        router.refresh();
        onDone?.(res.id);
      }}
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-card py-card">
      {trip ? <CoverControls trip={trip} /> : null}
      <Field label="Trip name" htmlFor="tn">
        <Input id="tn" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Goa, Dec 2026" />
      </Field>
      <Field label="Destination (optional)" htmlFor="td" hint="Used to find the card photo. Defaults to the trip name">
        <Input id="td" value={v.destination} onChange={(e) => setV({ ...v, destination: e.target.value })} placeholder="e.g. Disneyland, California" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start" htmlFor="ts">
          <Input id="ts" type="date" value={v.start_date} onChange={(e) => setV({ ...v, start_date: e.target.value })} />
        </Field>
        <Field label="End" htmlFor="te">
          <Input id="te" type="date" value={v.end_date} onChange={(e) => setV({ ...v, end_date: e.target.value })} />
        </Field>
      </div>
      <Field label={`Trip budget (${app.currency}, optional)`} htmlFor="tb">
        <Input id="tb" type="number" inputMode="decimal" min={0} value={v.budget} onChange={(e) => setV({ ...v, budget: e.target.value })} />
      </Field>
      <div>
        <p className="mb-2 text-sm text-muted">Count in monthly spending?</p>
        <ModePicker value={v.include_mode} onChange={(m) => setV({ ...v, include_mode: m })} />
      </div>
      {v.include_mode === "lump_sum" ? (
        <div className="grid grid-cols-2 gap-3 rounded-inset bg-surface-2 p-3 sm:grid-cols-3">
          <Field label="Category" htmlFor="lc">
            <Select id="lc" value={v.lump_category_id} onChange={(e) => setV({ ...v, lump_category_id: e.target.value })}>
              <option value="">Choose…</option>
              {app.categories.filter((c) => c.kind === "expense").map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Count on" htmlFor="ld" hint="Defaults to start date">
            <Input id="ld" type="date" value={v.lump_date} onChange={(e) => setV({ ...v, lump_date: e.target.value })} />
          </Field>
          <Field label="Spread over (months)" htmlFor="lm" hint="Normalized view only">
            <Input id="lm" type="number" min={1} max={120} placeholder="1" value={v.lump_spread_months} onChange={(e) => setV({ ...v, lump_spread_months: e.target.value })} />
          </Field>
        </div>
      ) : null}
      <Field label="Notes" htmlFor="tno">
        <Textarea id="tno" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} className="min-h-16" />
      </Field>
      </div>

      {trip && askDelete ? (
        <div className="shrink-0 space-y-2 border-t border-border bg-surface-2 px-card py-3">
          {confirm ? (
            <>
              <p className="text-sm text-muted">{confirm === "all" ? "This deletes the trip and every expense in it. It can't be undone." : "The trip is deleted. Its expenses stay, without a trip."}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" disabled={a.pending} onClick={() => a.run(() => deleteTrip(trip.id, confirm === "all"), () => router.push("/trips"))}>
                  {confirm === "all" ? "Yes, delete trip and expenses" : "Yes, delete trip"}
                </Button>
                <Button variant="ghost" onClick={() => { setConfirm(null); setAskDelete(false); }}>Keep trip</Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">What happens to the expenses in this trip?</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setConfirm("keep")}>Keep expenses</Button>
                <Button variant="danger" onClick={() => setConfirm("all")}>Delete them too</Button>
                <Button variant="ghost" onClick={() => setAskDelete(false)}>Keep trip</Button>
              </div>
            </>
          )}
        </div>
      ) : null}

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-surface px-card py-3 pb-safe">
        {trip ? (
          <Button variant="ghost" aria-label="Delete trip" aria-expanded={askDelete} className="-ml-3 text-bad hover:bg-bad/15 max-sm:w-11 max-sm:px-0" onClick={() => setAskDelete((x) => !x)}>
            <Trash2 size={16} />
            <span className="max-sm:sr-only">Delete</span>
          </Button>
        ) : <span />}
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => onDone?.()}>
            <X size={16} />
            Cancel
          </Button>
          <Button type="submit" className="min-w-28">{trip ? "Save trip" : "Create trip"}</Button>
        </div>
      </div>
    </form>
  );
}

const COVER_TYPES = ["image/png", "image/jpeg", "image/webp"];

function CoverControls({ trip }: { trip: Trip }) {
  const app = useAppData();
  const a = useAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const hasCover = Boolean(trip.cover_url || trip.cover_path);
  const busy = a.pending || uploading;

  // uploaded covers live in a private bucket, so the preview needs a signed URL
  useEffect(() => {
    const path = trip.cover_path;
    if (!path) return;
    let live = true;
    void createClient()
      .storage.from("trip-covers")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (live && data?.signedUrl) setSigned({ path, url: data.signedUrl });
      });
    return () => {
      live = false;
    };
  }, [trip.cover_path]);

  const previewSrc = trip.cover_path ? (signed?.path === trip.cover_path ? signed.url : null) : trip.cover_url;

  async function onPick(file: File | undefined) {
    if (!file) return;
    if (!COVER_TYPES.includes(file.type)) return void toast.error("Use a PNG, JPEG or WebP photo.");
    if (file.size > 5 * 1024 * 1024) return void toast.error("That photo is larger than 5 MB.");
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${app.userId}/${trip.id}-${crypto.randomUUID()}.${ext}`;
    setUploading(true);
    const up = await createClient().storage.from("trip-covers").upload(path, file, { contentType: file.type });
    setUploading(false);
    if (up.error) return void toast.error(`Upload failed: ${up.error.message}`);
    a.run(() => setTripCoverUpload(trip.id, path));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Card photo <span className="text-faint">· changes here save right away</span></p>
      <div className="relative h-40 overflow-hidden rounded-inset border border-border bg-surface-2">
        {previewSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- hotlinked stock photo / signed URL
          <img src={previewSrc} alt="Current card photo" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        ) : (
          <p className="flex h-full items-center justify-center px-4 text-center text-sm text-muted">
            {trip.cover_path ? "Loading photo…" : "No photo yet. The card uses the plain style"}
          </p>
        )}
      </div>
      {trip.cover_url && !trip.cover_path && trip.cover_credit_name && trip.cover_credit_url ? (
        <p className="text-xs text-muted">
          Photo by{" "}
          <a href={trip.cover_credit_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{trip.cover_credit_name}</a>
          {" on "}
          <a href="https://unsplash.com/?utm_source=spend_analyser&utm_medium=referral" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Unsplash</a>
        </p>
      ) : null}
      <input ref={fileRef} type="file" accept={COVER_TYPES.join(",")} className="sr-only" tabIndex={-1} onChange={(e) => { void onPick(e.target.files?.[0]); e.target.value = ""; }} />
      <div className={cn("grid gap-2", hasCover ? "grid-cols-3" : "grid-cols-2")}>
        <Button variant="outline" disabled={busy} onClick={() => a.run(() => refreshTripCover(trip.id))}>
          {hasCover ? "New photo" : "Find a photo"}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
          {uploading ? "Uploading…" : "Upload"}
        </Button>
        {hasCover ? (
          <Button variant="outline" disabled={busy} onClick={() => a.run(() => removeTripCover(trip.id))}>Remove</Button>
        ) : null}
      </div>
    </div>
  );
}
