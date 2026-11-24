import Link from "next/link";
import { Search } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { PriceLine } from "@/components/charts/price-line";
import { ClickAway } from "@/components/items/click-away";
import { PriceTag } from "@/components/items/price-tag";
import { shapePriceTag } from "@/lib/analytics/price-tag";
import { ReadReceiptButton } from "@/components/insights/read-receipt-button";
import { InboxList } from "@/components/receipts/inbox-list";
import { loadInbox } from "@/lib/receipts/inbox";
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
  const tab = sp.tab === "inbox" ? "inbox" : "items";
  const { supabase } = await requireUser();
  const inbox = await loadInbox(supabase, currency);
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
        merchant: [...sorted].reverse().find((r) => r.merchants?.name)?.merchants?.name ?? null,
        lastPrice: last,
        change: list.length > 1 && first > 0 ? (last - first) / first : null,
      };
    })
    .filter((i) => !q || i.name.toLowerCase().includes(q) || (i.category ?? "").toLowerCase().includes(q))
    .sort((a, b) => b.spent - a.spent);

  const sel = selected ? groups.get(selected) : null;
  const history = sel ? [...sel].sort((a, b) => (a.purchased_at ?? "").localeCompare(b.purchased_at ?? "")) : [];

  /** Props for one shelf tag, formatted here so the component stays plain. */
  const tagFor = (name: string, list: Row[]) => {
    const t = shapePriceTag(list.map((r) => ({ date: r.purchased_at, price: unitPrice(r), merchant: r.merchants?.name })));
    if (!t) return null;
    const ratio = t.change == null ? 0 : Math.abs(t.change);
    return {
      name,
      price: formatMoney(t.current, currency),
      direction: t.direction,
      changeText: t.change == null ? null : formatPercent(ratio, ratio < 0.1 ? 1 : 0),
      vsText: t.previous != null ? `vs ${formatMoney(t.previous, currency)} last time` : null,
      history: t.history,
      footer: [t.lastMerchant, t.lastDate ? formatDay(t.lastDate) : null].filter(Boolean).join(" · ") || "No store or date",
    };
  };
  const selectedTag = sel && selected ? tagFor(selected, sel) : null;
  /** The six items whose latest price moved most against the purchase before it; unchanged ones are left out. */
  const shelf = items
    .map((i) => ({ name: i.name, shape: shapePriceTag(groups.get(i.name)!.map((r) => ({ date: r.purchased_at, price: unitPrice(r), merchant: r.merchants?.name }))) }))
    .filter((x) => x.shape && x.shape.direction && x.shape.direction !== "flat")
    .sort((a, b) => Math.abs(b.shape!.change!) - Math.abs(a.shape!.change!))
    .slice(0, 6)
    .map((x) => ({ href: `?${new URLSearchParams({ ...(q ? { q } : {}), item: x.name })}`, tag: tagFor(x.name, groups.get(x.name)!) }));
  const clearHref = q ? `?${new URLSearchParams({ q })}` : "/items";

  const priceNote = (() => {
    if (history.length < 2) return "";
    const f = unitPrice(history[0]);
    const l = unitPrice(history.at(-1)!);
    const ch = f > 0 ? (l - f) / f : 0;
    return Math.abs(ch) < 0.01 ? " · price unchanged" : ` · price ${ch > 0 ? "up" : "down"} ${formatPercent(Math.abs(ch))} since first purchase`;
  })();

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <InfoTitle as="h1" info={HELP.items} className="text-2xl font-medium" panelClassName="max-w-xl">Items</InfoTitle>
          <p className="mt-1 text-sm text-muted">Everything you bought, from your receipts: what, when, where and for how much.</p>
        </div>
        <ReadReceiptButton />
      </div>

      <nav aria-label="Items sections" className="mb-5 flex gap-1 border-b border-border">
        {[
          { key: "items", label: "Items", href: "/items" },
          { key: "inbox", label: inbox.length ? `Inbox (${inbox.length})` : "Inbox", href: "/items?tab=inbox" },
        ].map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm transition-colors duration-(--dur-fast)", tab === t.key ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text")}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "inbox" ? (
        inbox.length ? (
          <Card>
            <CardHeader title="Inbox" subtitle="Receipts read and kept for later. Match one to a transaction when it posts." />
            <InboxList receipts={inbox} />
          </Card>
        ) : (
          <EmptyState title="Inbox is empty" body="Receipts you keep for later, or only partly match, wait here. When a statement import adds the transaction, it shows up as a likely match." action={<ReadReceiptButton />} />
        )
      ) : rows.length ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <ClickAway active={!!selected} href={clearHref} />
          <Card className="min-w-0" data-keep>
            <form className="relative mb-3">
              <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
              <input name="q" defaultValue={q} placeholder={`Search ${groups.size} items`} aria-label="Search items" className="h-11 w-full rounded-control border border-border bg-surface-2 pl-10 pr-4 text-sm outline-none transition-colors duration-(--dur-fast) focus:border-accent" />
            </form>
            <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-x-3 border-b border-border px-2 pb-2 text-label text-faint sm:grid-cols-[minmax(0,1fr)_8rem_6rem_4rem_5.5rem]">
              <span>Item</span>
              <span className="hidden sm:block">Merchant</span>
              <span className="text-right">Last price</span>
              <span className="hidden text-right sm:block">Change</span>
              <span className="hidden text-right sm:block">Spent</span>
            </div>
            <ul className="divide-y divide-border">
              {items.slice(0, 200).map((i) => {
                const moved = i.change != null && Math.abs(i.change) >= 0.01;
                const change = moved ? `${i.change! > 0 ? "+" : "−"}${formatPercent(Math.abs(i.change!))}` : "–";
                const tone = moved ? (i.change! > 0 ? "text-bad" : "text-good") : "text-faint";
                return (
                  <li key={i.name}>
                    <Link
                      href={`?${new URLSearchParams({ ...(q ? { q } : {}), item: i.name })}`}
                      scroll={false}
                      className={cn("grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-x-3 rounded-control px-2 py-3 transition-colors duration-(--dur-fast) hover:bg-surface-2 sm:grid-cols-[minmax(0,1fr)_8rem_6rem_4rem_5.5rem]", selected === i.name && "bg-surface-3 ring-1 ring-inset ring-text/10")}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{i.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {i.category ? `${i.category} · ` : ""}{i.merchant ? <span className="sm:hidden">{i.merchant} · </span> : null}bought {i.times}× · last {i.lastDate ? formatDay(i.lastDate) : "?"}
                        </span>
                      </span>
                      <span className="hidden truncate text-sm text-muted sm:block">{i.merchant ?? "–"}</span>
                      <span className="text-right text-sm">
                        <span className="money block">{formatMoney(i.lastPrice, currency)}</span>
                        <span className={cn("num block text-xs sm:hidden", tone)}>{change}</span>
                      </span>
                      <span className={cn("num hidden text-right text-sm sm:block", tone)}>{change}</span>
                      <span className="money hidden text-right text-sm sm:block">{formatMoney(i.spent, currency, { whole: true })}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
          <div className="space-y-4">
            {sel && history.length ? (
              <Card data-keep>
                <CardHeader title={selected!} subtitle={`${history.length} purchases · ${formatMoney(round2(history.reduce((a, r) => a + Number(r.total_price ?? 0), 0)), currency)} total${priceNote}`} />
                {selectedTag ? <PriceTag {...selectedTag} className="mb-4" /> : null}
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
                      <span className="money shrink-0 whitespace-nowrap text-muted">
                        {h.quantity ? `${h.quantity}${h.unit ? ` ${h.unit}` : ""} × ` : ""}
                        <span className="text-text">{formatMoney(unitPrice(h), currency)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <Card>
                <CardHeader title="On the shelf" subtitle="The items whose price changed most since the purchase before. Pick one to see when you bought it and how its price moved." />
                {shelf.length ? (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {shelf.map((s) =>
                      s.tag ? (
                        <li key={s.tag.name}>
                          <Link href={s.href} scroll={false} className="block rounded-inset transition-opacity duration-(--dur-fast) hover:opacity-80">
                            <PriceTag {...s.tag} />
                          </Link>
                        </li>
                      ) : null,
                    )}
                  </ul>
                ) : (
                  <p className="py-6 text-center text-sm text-muted">No price changes yet. Items bought more than once show up here when the price moves.</p>
                )}
              </Card>
            )}
          </div>
        </div>
      ) : (
        <EmptyState
          title="No items yet"
          body={ref.aiReady ? "Read a receipt (PDF, photo or Drive link) and every line item is saved here with its price and date." : "Item tracking needs an AI provider configured on the server to read receipts."}
          action={<ReadReceiptButton />}
        />
      )}
    </>
  );
}
