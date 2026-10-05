"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useAppData } from "@/components/app-data";
import { useAction } from "@/hooks/use-action";
import { cn } from "@/lib/utils";
import { deleteTrip, saveTrip } from "@/app/(app)/trips/actions";
import type { Trip, TripMode } from "@/lib/data/types";
import { MODE_COPY } from "@/lib/trip-modes";


export function ModePicker({ value, onChange }: { value: TripMode; onChange: (m: TripMode) => void }) {
  return (
    <div role="radiogroup" aria-label="Count this trip in monthly spending" className="grid gap-2 sm:grid-cols-3">
      {(Object.keys(MODE_COPY) as TripMode[]).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={value === m}
          onClick={() => onChange(m)}
          className={cn("rounded-2xl border p-3 text-left transition", value === m ? "border-accent bg-accent/10" : "border-border bg-surface-2 hover:bg-surface-3")}
        >
          <span className="block text-sm font-medium">{MODE_COPY[m].title}</span>
          <span className="mt-1 block text-xs text-muted">{MODE_COPY[m].body}</span>
        </button>
      ))}
    </div>
  );
}

export function TripForm({ trip, onDone }: { trip?: Trip; onDone?: (id?: string) => void }) {
  const app = useAppData();
  const router = useRouter();
  const travel = app.categories.find((c) => c.name.toLowerCase() === "travel" && c.kind === "expense");
  const [v, setV] = useState({
    name: trip?.name ?? "",
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
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await saveTrip({
          id: trip?.id,
          name: v.name,
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
      <Field label="Trip name" htmlFor="tn">
        <Input id="tn" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Goa, Dec 2026" />
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
        <div className="grid grid-cols-2 gap-3 rounded-2xl bg-surface-2 p-3 sm:grid-cols-3">
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
      <Button type="submit" size="lg" className="w-full">{trip ? "Save trip" : "Create trip"}</Button>

      {trip ? (
        <div className="space-y-2 border-t border-border pt-4">
          {confirm ? (
            <div className="flex flex-col gap-2">
              <Button variant="danger" onClick={() => a.run(() => deleteTrip(trip.id, confirm === "all"), () => router.push("/trips"))}>
                {confirm === "all" ? "Yes, delete trip and all its expenses" : "Yes, delete trip (keep expenses)"}
              </Button>
              <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={() => setConfirm("keep")}>Delete trip, keep expenses</Button>
              <Button variant="danger" onClick={() => setConfirm("all")}>Delete trip and expenses</Button>
            </div>
          )}
        </div>
      ) : null}
    </form>
  );
}
