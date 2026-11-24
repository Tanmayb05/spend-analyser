"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { merchantContext, HISTORY_MAX, type PastCharge, type TxnContext } from "@/lib/analytics/txn-context";
import { sparkPath, sparkPoints } from "@/lib/analytics/price-tag";

const W = 160;
const H = 36;
const dots = { good: "bg-good", warn: "bg-warn", muted: "bg-faint" } as const;

type Loaded = { context: TxnContext | null };

/**
 * "How this compares": this charge against your earlier ones at the same merchant, as a sentence and a small line.
 * Read live from the transactions table; nothing is stored. Shown only for single entries with a merchant.
 */
export function TxnContextStrip({ txnId, type, merchantId, merchant, amount, date, currency }: { txnId: string; type: string; merchantId: string; merchant: string; amount: number; date: string; currency: string }) {
  const [state, setState] = useState<Loaded | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data } = await createClient()
        .from("transactions")
        .select("date, amount, base_amount")
        .eq("merchant_id", merchantId)
        .eq("type", type as "expense" | "income" | "refund")
        .neq("id", txnId)
        .lte("date", date)
        .order("date", { ascending: false })
        .limit(HISTORY_MAX);
      if (!live) return;
      const past: PastCharge[] = (data ?? []).map((r) => ({ date: r.date, amount: Number(r.base_amount ?? r.amount) }));
      setState({ context: merchantContext({ amount, date, income: type !== "expense" }, past, { merchant, money: (n) => formatMoney(n, currency) }) });
    })();
    return () => {
      live = false;
    };
  }, [txnId, type, merchantId, merchant, amount, date, currency]);

  if (!state) return null;
  const c = state.context;
  const box = "rounded-control border border-border bg-surface-2 px-3 py-3";
  if (!c) {
    return (
      <div className={box}>
        <p className="text-sm font-medium">First time at {merchant}</p>
        <p className="mt-0.5 text-xs text-muted">Nothing earlier to compare with yet</p>
      </div>
    );
  }
  const pts = sparkPoints(c.spark, W, H, 4);
  const last = pts.at(-1);
  // dashed guide at the average of the earlier amounts, on the same scale as the line
  const earlier = c.spark.slice(0, -1);
  const avg = earlier.reduce((a, b) => a + b, 0) / Math.max(1, earlier.length);
  const lo = Math.min(...c.spark);
  const span = Math.max(...c.spark) - lo;
  const avgY = span === 0 ? H / 2 : 4 + (1 - (avg - lo) / span) * (H - 8);
  const first = c.spark[0];
  const end = (v: number) => formatMoney(v, currency, { whole: v >= 100 });
  return (
    <div className={box}>
      <p className="flex items-center gap-2 text-sm font-medium">
        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", dots[c.tone])} />
        {c.headline}
      </p>
      <p className="mt-0.5 text-xs text-muted">{c.detail}</p>
      {pts.length > 1 ? (
        <div className="mt-3 flex items-center gap-3">
          <span className="money w-14 shrink-0 text-xs text-muted">{end(first)}</span>
          <div className="relative h-9 min-w-0 flex-1 text-muted" role="img" aria-label={`Last ${c.spark.length} amounts at ${merchant}, dashed line is the average`}>
            <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full">
              <line x1="0" x2={W} y1={avgY} y2={avgY} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
              <path d={sparkPath(pts)} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
            {last ? <span aria-hidden className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" style={{ left: `${(last.x / W) * 100}%`, top: `${(last.y / H) * 100}%` }} /> : null}
          </div>
          <span className="money w-14 shrink-0 text-right text-xs">{end(c.spark.at(-1)!)}</span>
        </div>
      ) : null}
    </div>
  );
}
