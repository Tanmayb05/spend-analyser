"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Sparkles } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatDay } from "@/lib/dates";
import {
  applyCategoriesAction,
  applyItemNamesAction,
  applyMerchantsAction,
  suggestCategoriesAction,
  suggestItemNamesAction,
  suggestMerchantsAction,
  type CategorizeRow,
  type MerchantFixRow,
} from "@/app/(app)/ai/tidy-actions";
import type { ItemSuggestion } from "@/lib/ai/tidy";

type Common = { ready: boolean; left: number };

/** Suggest → review (tick what to keep) → apply. Shared by the three tidy-up cards. */
function useReview<T>() {
  const [rows, setRows] = useState<T[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const router = useRouter();
  const toggle = (i: number) => setPicked((p) => (p.has(i) ? new Set([...p].filter((x) => x !== i)) : new Set(p).add(i)));
  const load = (next: T[], preselect: (r: T) => boolean) => {
    setRows(next);
    setPicked(new Set(next.flatMap((r, i) => (preselect(r) ? [i] : []))));
  };
  const finish = (r: { ok: true; message: string } | { ok: false; error: string }) => {
    if (!r.ok) return void toast.error(r.error);
    toast.success(r.message);
    setRows(null);
    router.refresh();
  };
  return { rows, picked, pending, start, toggle, load, finish, reset: () => setRows(null) };
}

function Shell({ title, subtitle, info, count, ready, left, pending, onSuggest, children }: { title: string; subtitle: string; info?: ReactNode; count: string; ready: boolean; left: number; pending: boolean; onSuggest: () => void; children?: ReactNode }) {
  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle}
        info={info}
        action={
          ready ? (
            <Button variant="accent" size="sm" onClick={onSuggest} disabled={pending || left <= 0}>
              <Sparkles size={15} /> {pending ? "Working…" : "Suggest"}
            </Button>
          ) : null
        }
      />
      <p className="text-sm text-muted">{count}</p>
      {children}
    </Card>
  );
}

function ReviewList({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  return (
    <div className="mt-4 space-y-3">
      <ul className="max-h-112 divide-y divide-border overflow-y-auto rounded-2xl border border-border">{children}</ul>
      <div className="flex flex-wrap gap-2">{footer}</div>
    </div>
  );
}

function Row({ checked, onChange, label, children }: { checked: boolean; onChange: () => void; label: string; children: ReactNode }) {
  return (
    <li>
      <label className="flex cursor-pointer items-start gap-3 px-3 py-3 hover:bg-surface-2">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-accent" checked={checked} onChange={onChange} aria-label={label} />
        <span className="min-w-0 flex-1 text-sm">{children}</span>
      </label>
    </li>
  );
}

const Change = ({ from, to }: { from: ReactNode; to: ReactNode }) => (
  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
    <span className="line-through decoration-faint">{from}</span>
    <ArrowRight size={12} />
    <span className="font-medium text-text">{to}</span>
  </span>
);

// ---------------------------------------------------------------------------
export function CategorizePanel({ candidates, currency, ...c }: Common & { candidates: number; currency: string }) {
  const r = useReview<CategorizeRow>();
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const suggest = () =>
    r.start(async () => {
      const res = await suggestCategoriesAction();
      if (!res.ok) return void toast.error(res.error);
      if (!res.checkedIds.length) return void toast.info("Nothing to categorise.");
      setCheckedIds(res.checkedIds);
      r.load(res.rows, (x) => x.confidence !== "low");
      if (!res.rows.length) toast.info("The AI had no better categories for these. Press Done to mark them checked.");
    });
  const apply = (all: boolean) =>
    r.start(async () => {
      const accepted = all ? (r.rows ?? []).filter((_, i) => r.picked.has(i)).map((x) => ({ id: x.id, category_id: x.category_id, subcategory_id: x.subcategory_id })) : [];
      r.finish(await applyCategoriesAction({ accepted, checkedIds }));
    });
  return (
    <Shell
      title="Categorise transactions"
      subtitle="Rows in catch-all categories (Other, Uncategorized…) or missing a subcategory. Up to 50 per run."
      count={candidates ? `${candidates} transaction${candidates === 1 ? "" : "s"} to check.` : "Nothing to check right now."}
      pending={r.pending}
      onSuggest={suggest}
      {...c}
    >
      {r.rows ? (
        <ReviewList
          footer={
            <>
              <Button size="sm" onClick={() => apply(true)} disabled={r.pending}>{r.rows.length ? `Apply ${r.picked.size}` : "Done"}</Button>
              {r.rows.length ? <Button size="sm" variant="outline" onClick={() => apply(false)} disabled={r.pending}>Keep all as they are</Button> : null}
            </>
          }
        >
          {r.rows.map((x, i) => (
            <Row key={x.id} checked={r.picked.has(i)} onChange={() => r.toggle(i)} label={`Recategorise ${x.label}`}>
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate font-medium">{x.label}</span>
                <span className="num shrink-0">{formatMoney(x.amount, x.currency || currency)}</span>
              </span>
              <span className="text-xs text-faint">{formatDay(x.date)}</span>
              <Change from={x.from} to={x.to} />
              {x.confidence !== "high" ? <Badge tone={x.confidence === "low" ? "warn" : "neutral"} className="mt-1">{x.confidence} confidence</Badge> : null}
            </Row>
          ))}
        </ReviewList>
      ) : null}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
export function MerchantsPanel({ total, ...c }: Common & { total: number }) {
  const r = useReview<MerchantFixRow>();
  const suggest = () =>
    r.start(async () => {
      const res = await suggestMerchantsAction();
      if (!res.ok) return void toast.error(res.error);
      if (!res.groups.length) return void toast.info("Your merchant list already looks clean.");
      r.load(res.groups, () => true);
    });
  const apply = () =>
    r.start(async () => {
      const groups = (r.rows ?? [])
        .filter((_, i) => r.picked.has(i))
        .map((g) => ({ canonical: g.canonical, targetId: g.targetId, memberIds: g.members.map((m) => m.id), category_id: g.category_id, subcategory_id: g.subcategory_id }));
      if (!groups.length) return void r.reset();
      r.finish(await applyMerchantsAction({ groups }));
    });
  return (
    <Shell
      title="Clean up merchants"
      subtitle="Merge duplicates (“AMZN Mktp US*2X4” and “Amazon.com” become “Amazon”) and fill missing default categories."
      count={`${total} merchant${total === 1 ? "" : "s"}. The AI reads names and counts only.`}
      pending={r.pending}
      onSuggest={suggest}
      {...c}
    >
      {r.rows ? (
        <ReviewList
          footer={
            <>
              <Button size="sm" onClick={apply} disabled={r.pending}>Apply {r.picked.size}</Button>
              <Button size="sm" variant="outline" onClick={r.reset} disabled={r.pending}>Cancel</Button>
            </>
          }
        >
          {r.rows.map((g, i) => {
            const names = g.members.map((m) => m.name);
            const renames = names.some((n) => n !== g.canonical);
            return (
              <Row key={g.canonical + i} checked={r.picked.has(i)} onChange={() => r.toggle(i)} label={`Apply fix for ${g.canonical}`}>
                <span className="font-medium">{g.canonical}</span>
                {renames ? <Change from={names.filter((n) => n !== g.canonical).join(", ")} to={g.canonical} /> : null}
                {g.categoryLabel ? <span className="mt-0.5 block text-xs text-muted">Default category: {g.categoryLabel}</span> : null}
              </Row>
            );
          })}
        </ReviewList>
      ) : null}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
export function ItemsPanel({ candidates, ...c }: Common & { candidates: number }) {
  const r = useReview<ItemSuggestion>();
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const suggest = () =>
    r.start(async () => {
      const res = await suggestItemNamesAction();
      if (!res.ok) return void toast.error(res.error);
      if (!res.checkedIds.length) return void toast.info("No new receipt items to check.");
      setCheckedIds(res.checkedIds);
      r.load(res.items, () => true);
      if (!res.items.length) toast.info("Item names already look consistent. Press Done to mark them checked.");
    });
  const apply = (all: boolean) =>
    r.start(async () => {
      const accepted = all ? (r.rows ?? []).filter((_, i) => r.picked.has(i)).map((x) => ({ ids: x.ids, normalized_name: x.to, item_category: x.item_category })) : [];
      r.finish(await applyItemNamesAction({ accepted, checkedIds }));
    });
  return (
    <Shell
      title="Tidy item names"
      subtitle="Gives the same product one name across receipts, so price history on Items lines up."
      count={candidates ? `${candidates} printed name${candidates === 1 ? "" : "s"} not checked yet.` : "All receipt items checked."}
      pending={r.pending}
      onSuggest={suggest}
      {...c}
    >
      {r.rows ? (
        <ReviewList
          footer={
            <>
              <Button size="sm" onClick={() => apply(true)} disabled={r.pending}>{r.rows.length ? `Apply ${r.picked.size}` : "Done"}</Button>
              {r.rows.length ? <Button size="sm" variant="outline" onClick={() => apply(false)} disabled={r.pending}>Keep all as they are</Button> : null}
            </>
          }
        >
          {r.rows.map((x, i) => (
            <Row key={x.raw_name} checked={r.picked.has(i)} onChange={() => r.toggle(i)} label={`Rename ${x.raw_name}`}>
              <span className="font-medium">{x.raw_name}</span>
              <span className="ml-2 text-xs text-faint">{x.ids.length} line{x.ids.length === 1 ? "" : "s"}</span>
              <Change from={`${x.from ?? "-"} · ${x.fromCategory ?? "-"}`} to={`${x.to} · ${x.item_category}`} />
            </Row>
          ))}
        </ReviewList>
      ) : null}
    </Shell>
  );
}
