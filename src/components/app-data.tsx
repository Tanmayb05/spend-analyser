"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ReferenceData } from "@/lib/data/types";

type TxnSheetState = { open: false } | { open: true; id?: string; preset?: Record<string, string> };

type Ctx = ReferenceData & {
  maps: {
    category: Map<string, ReferenceData["categories"][number]>;
    subcategory: Map<string, ReferenceData["subcategories"][number]>;
    trip: Map<string, ReferenceData["trips"][number]>;
    person: Map<string, ReferenceData["people"][number]>;
    payment: Map<string, ReferenceData["paymentMethods"][number]>;
  };
  currency: string;
  txnSheet: TxnSheetState;
  openTxnSheet: (opts?: { id?: string; preset?: Record<string, string> }) => void;
  closeTxnSheet: () => void;
};

const AppDataContext = createContext<Ctx | null>(null);

export function AppDataProvider({ data, children }: { data: ReferenceData; children: ReactNode }) {
  const [txnSheet, setTxnSheet] = useState<TxnSheetState>({ open: false });

  const value = useMemo<Ctx>(
    () => ({
      ...data,
      currency: data.profile.base_currency,
      maps: {
        category: new Map(data.categories.map((c) => [c.id, c])),
        subcategory: new Map(data.subcategories.map((s) => [s.id, s])),
        trip: new Map(data.trips.map((t) => [t.id, t])),
        person: new Map(data.people.map((p) => [p.id, p])),
        payment: new Map(data.paymentMethods.map((p) => [p.id, p])),
      },
      txnSheet,
      openTxnSheet: (opts) => setTxnSheet({ open: true, ...opts }),
      closeTxnSheet: () => setTxnSheet({ open: false }),
    }),
    [data, txnSheet],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used inside AppDataProvider");
  return ctx;
}
