"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useAppData } from "@/components/app-data";
import { TripForm } from "./trip-form";
import type { Trip } from "@/lib/data/types";

export function NewTripButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={16} /> New trip
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="New trip">
        {open ? <TripForm onDone={(id) => { setOpen(false); if (id) router.push(`/trips/${id}`); }} /> : null}
      </Sheet>
    </>
  );
}

export function TripHeaderActions({ trip }: { trip: Trip }) {
  const [open, setOpen] = useState(false);
  const app = useAppData();
  const travel = app.categories.find((c) => c.name.toLowerCase() === "travel" && c.kind === "expense");
  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Pencil size={16} /> Edit
      </Button>
      <Button onClick={() => app.openTxnSheet({ preset: { trip_id: trip.id, category_id: travel?.id ?? "", date: trip.start_date && trip.start_date > app.today ? trip.start_date : app.today } })}>
        <Plus size={16} /> Add expense
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Edit ${trip.name}`}>
        {open ? <TripForm trip={trip} onDone={() => setOpen(false)} /> : null}
      </Sheet>
    </div>
  );
}
