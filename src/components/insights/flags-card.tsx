"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, ScanSearch, TrendingUp, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { formatDay } from "@/lib/dates";
import { dismissFlagAction, scanAnomaliesAction } from "@/app/(app)/ai/insight-actions";
import type { ReactNode } from "react";

export type FlagView = { id: string; kind: "duplicate" | "unusual"; reason: string; date: string; label: string; amount: number; currency: string; href: string };

export function FlagsCard({ flags, ready, left, info }: { flags: FlagView[]; ready: boolean; left: number; info?: ReactNode }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const scan = () =>
    start(async () => {
      const r = await scanAnomaliesAction();
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      router.refresh();
    });
  const dismiss = (id: string) =>
    start(async () => {
      const r = await dismissFlagAction(id);
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });

  return (
    <Card>
      <CardHeader
        title="Worth a second look"
        subtitle="Possible duplicates and unusually large expenses, last 4 months"
        info={info}
        action={
          ready ? (
            <Button size="sm" variant="outline" onClick={scan} disabled={pending || left <= 0}>
              <ScanSearch size={15} /> {pending ? "Checking…" : "Check now"}
            </Button>
          ) : null
        }
      />
      {flags.length ? (
        <ul className="space-y-2">
          {flags.map((f) => {
            const Icon = f.kind === "duplicate" ? Copy : TrendingUp;
            return (
              <li key={f.id} className="flex items-start gap-3 rounded-2xl bg-surface-2 p-3">
                <Icon size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden />
                <div className="min-w-0 flex-1 text-sm">
                  <Link href={f.href} className="flex items-baseline justify-between gap-3 hover:underline">
                    <span className="truncate font-medium">{f.label}</span>
                    <span className="num shrink-0">{formatMoney(f.amount, f.currency)}</span>
                  </Link>
                  <p className="text-xs text-faint">
                    {formatDay(f.date)} · {f.kind === "duplicate" ? "Possible duplicate" : "Unusually large"}
                  </p>
                  <p className="mt-1 leading-relaxed text-muted">{f.reason}</p>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Dismiss ${f.label}`} onClick={() => dismiss(f.id)} disabled={pending}>
                  <X size={15} />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          {ready ? "Nothing flagged. “Check now” looks for new duplicates and outliers; each entry is only checked once, and if nothing new is found no AI run is used." : "Needs AI to be configured on the server."}
        </p>
      )}
    </Card>
  );
}
