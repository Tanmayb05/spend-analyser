import Link from "next/link";
import { Search } from "lucide-react";
import { Card, CardHeader, Insight } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { PriceLine } from "@/components/charts/price-line";
import { ReadReceiptButton } from "@/components/insights/read-receipt-button";
import { getReferenceData } from "@/lib/data/reference";
import { requireUser } from "@/lib/supabase/server";
import { formatDay } from "@/lib/dates";
import { formatMoney, formatPercent } from "@/lib/money";
import { cn, round2 } from "@/lib/utils";
import { InfoTitle } from "@/components/ui/info-title";
import { HELP } from "@/lib/help";

export const metadata = { title: "Items" };

type Row = { normalized_name: string | null; raw_name: string; item_category: string | null; quantity: number | null; unit: string | null; unit_price: number | null; total_price: number | null; purchased_at: string | null; merchants: { name: string } | null };

export default async function ItemsPage({ searchParams }: PageProps<"/items">) {
  const sp = await searchParams;
  const ref = await getReferenceData();
  const currency = ref.profile.base_currency;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const selected = typeof sp.item === "string" ? sp.item : null;
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("receipt_items")
    .select("normalized_name, raw_name, item_category, quantity, unit, unit_price, total_price, purchased_at, merchants(name)")
    .order("purchased_at", { ascending: false })
    .limit(5000)
    .returns<Row[]>();
  const rows = data ?? [];

  const unitPrice = (r: Row) => Number(r.unit_price ?? (r.quantity ? Number(r.total_price) / Number(r.quantity) : r.total_price) ?? 0);
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.normalized_name || r.raw_name;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const items = [...groups.entries()]
    .map(([name, list]) => {
      const sorted = [...list].sort((a, b) => (a.purchased_at ?? "").localeCompare(b.purchased_at ?? ""));
      const first = unitPrice(sorted[0]);
      const last = unitPrice(sorted.at(-1)!);
      return {
        name,
        category: list[0].item_category,
        times: list.length,
        spent: round2(list.reduce((a, r) => a + Number(r.total_price ?? 0), 0)),
        lastDate: sorted.at(-1)!.purchased_at,
        lastPrice: last,
        change: list.length > 1 && first > 0 ? (last - first) / first : null,
      };
    })
    .filter((i) => !q || i.name.toLowerCase().includes(q) || (i.category ?? "").toLowerCase().includes(q))
    .sort((a, b) => b.spent - a.spent);

  const sel = selected ? groups.get(selected) : null;
  const history = sel ? [...sel].sort((a, b) => (a.purchased_at ?? "").localeCompare(b.purchased_at ?? "")) : [];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <InfoTitle as="h1" info={HELP.items} className="text-3xl font-medium sm:text-4xl" panelClassName="max-w-xl">Items</InfoTitle>
          <p className="mt-1 text-sm text-muted">Everything you bought, from your receipts: what, when, where and for how much.</p>
        </div>
        <ReadReceiptButton />
      </div>

      {rows.length ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <Card className="min-w-0">
            <form className="relative mb-3">
              <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
              <input name="q" defaultValue={q} placeholder={`Search ${groups.size} items`} aria-label="Search items" className="h-11 w-full rounded-full border border-border bg-surface-2 pl-10 pr-4 text-sm outline-none focus:border-accent" />
            </form>
            <ul className="divide-y divide-border">
              {items.slice(0, 200).map((i) => (
                <li key={i.name}>
                  <Link href={`?${new URLSearchParams({ ...(q ? { q } : {}), item: i.name })}`} scroll={false} className={cn("flex items-center gap-3 rounded-2xl px-2 py-3 hover:bg-surface-2", selected === i.name && "bg-surface-2")}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{i.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {i.category ? `${i.category} · ` : ""}bought {i.times}× · last {i.lastDate ? formatDay(i.lastDate) : "?"}
                      </span>
                    </span>
                    <span className="text-right text-sm">
                      <span className="num block font-medium">{formatMoney(i.lastPrice, currency)}</span>
                      {i.change != null && Math.abs(i.change) >= 0.01 ? (
                        <span className={cn("num block text-xs", i.change > 0 ? "text-bad" : "text-good")}>
                          {i.change > 0 ? "▲" : "▼"} {formatPercent(Math.abs(i.change))}
                        </span>
                      ) : (
                        <span className="block text-xs text-faint">{formatMoney(i.spent, currency, { whole: true })} total</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <div className="space-y-4">
            {sel && history.length ? (
              <Card>
                <CardHeader title={selected!} subtitle={`${history.length} purchases · ${formatMoney(round2(history.reduce((a, r) => a + Number(r.total_price ?? 0), 0)), currency)} total`} />
                {history.length > 1 ? (
                  <PriceLine points={history.filter((h) => h.purchased_at).map((h) => ({ date: h.purchased_at!, price: unitPrice(h), merchant: h.merchants?.name }))} currency={currency} />
                ) : null}
                <ul className="mt-4 divide-y divide-border text-sm">
                  {[...history].reverse().map((h, i) => (
                    <li key={i} className="flex justify-between gap-3 py-2">
                      <span>
                        {h.purchased_at ? formatDay(h.purchased_at) : "?"}
                        <span className="text-muted">{h.merchants?.name ? ` · ${h.merchants.name}` : ""}</span>
                      </span>
                      <span className="num text-muted">
                        {h.quantity ? `${h.quantity}${h.unit ? ` ${h.unit}` : ""} × ` : ""}
                        <span className="text-text">{formatMoney(unitPrice(h), currency)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {history.length > 1 ? (
                  <Insight>
                    {(() => {
                      const f = unitPrice(history[0]);
                      const l = unitPrice(history.at(-1)!);
                      const ch = f > 0 ? (l - f) / f : 0;
                      return Math.abs(ch) < 0.01 ? "The price has stayed the same." : `The price ${ch > 0 ? "went up" : "dropped"} ${formatPercent(Math.abs(ch))} since your first purchase (${formatMoney(f, currency)} → ${formatMoney(l, currency)}).`;
                    })()}
                  </Insight>
                ) : null}
              </Card>
            ) : (
              <Card>
                <p className="py-10 text-center text-sm text-muted">Pick an item to see when you bought it and how its price changed.</p>
              </Card>
            )}
          </div>
        </div>
      ) : (
        <EmptyState
          title="No items yet"
          body={ref.aiReady ? "Read a receipt (PDF, photo or Drive link) and every line item is saved here with its price and date." : "Item tracking needs Gemini (GEMINI_API_KEY) to read receipts."}
          action={<ReadReceiptButton />}
        />
      )}
    </>
  );
}
