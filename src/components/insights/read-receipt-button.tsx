"use client";

import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/components/app-data";

export function ReadReceiptButton() {
  const app = useAppData();
  if (!app.aiReady) return null;
  return (
    <Button onClick={() => app.openTxnSheet({ preset: { __receipt: "1" } })}>
      <Receipt size={16} /> Read a receipt
    </Button>
  );
}
