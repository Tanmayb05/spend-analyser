"use client";

import { Plus, Upload } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/components/app-data";

export function AddFirst() {
  const { openTxnSheet } = useAppData();
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Button onClick={() => openTxnSheet()}>
        <Plus size={18} /> Add a transaction
      </Button>
      <Link href="/settings/data" className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-surface-2 px-4 text-sm font-medium hover:bg-surface-3">
        <Upload size={18} /> Import Excel / CSV
      </Link>
    </div>
  );
}
