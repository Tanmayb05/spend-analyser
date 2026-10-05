"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useAction } from "@/hooks/use-action";
import { useAppData } from "@/components/app-data";
import { formatMoney } from "@/lib/money";
import { deleteMerchant, mergeMerchant, saveMerchant } from "@/app/(app)/settings/actions";
import type { Merchant } from "@/lib/data/types";

type Stat = { count: number; total: number };

export function MerchantsEditor({ stats }: { stats: Record<string, Stat> }) {
  const app = useAppData();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Merchant | null>(null);
  const list = useMemo(
    () =>
      app.merchants
        .filter((m) => m.name.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => (stats[b.id]?.total ?? 0) - (stats[a.id]?.total ?? 0)),
    [app.merchants, q, stats],
  );

  return (
    <>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
        <Input aria-label="Search merchants" placeholder={`Search ${app.merchants.length} merchants`} value={q} onChange={(e) => setQ(e.target.value)} className="pl-10" />
      </div>
      <Card className="p-2 sm:p-2">
        <ul>
          {list.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => setEditing(m)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {m.default_category_id ? app.maps.category.get(m.default_category_id)?.name : "No default category"}
                    {m.default_subcategory_id ? ` › ${app.maps.subcategory.get(m.default_subcategory_id)?.name ?? ""}` : ""}
                  </span>
                </span>
                <span className="text-right text-xs text-muted">
                  <span className="num block text-sm text-text">{formatMoney(stats[m.id]?.total ?? 0, app.currency, { whole: true })}</span>
                  {stats[m.id]?.count ?? 0} txns
                </span>
                <ChevronRight size={16} className="text-faint" />
              </button>
            </li>
          ))}
          {!list.length ? <li className="px-3 py-6 text-center text-sm text-muted">No merchants found.</li> : null}
        </ul>
      </Card>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? editing.name : ""}>
        {editing ? <MerchantForm key={editing.id} merchant={editing} uses={stats[editing.id]?.count ?? 0} onDone={() => setEditing(null)} /> : null}
      </Sheet>
    </>
  );
}

function MerchantForm({ merchant, uses, onDone }: { merchant: Merchant; uses: number; onDone: () => void }) {
  const app = useAppData();
  const a = useAction();
  const [v, setV] = useState({ name: merchant.name, cat: merchant.default_category_id ?? "", sub: merchant.default_subcategory_id ?? "" });
  const [into, setInto] = useState("");
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="space-y-5">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          a.run(() => saveMerchant({ id: merchant.id, name: v.name, default_category_id: v.cat || null, default_subcategory_id: v.sub || null }), onDone);
        }}
      >
        <Field label="Name" htmlFor="mn">
          <Input id="mn" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Default category" htmlFor="mc" hint="Pre-filled when you pick this merchant.">
            <Select id="mc" value={v.cat} onChange={(e) => setV({ ...v, cat: e.target.value, sub: "" })}>
              <option value="">None</option>
              {app.categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Subcategory" htmlFor="ms">
            <Select id="ms" value={v.sub} onChange={(e) => setV({ ...v, sub: e.target.value })} disabled={!v.cat}>
              <option value="">None</option>
              {app.subcategories.filter((s) => s.category_id === v.cat).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" className="w-full" disabled={a.pending}>Save</Button>
      </form>

      <div className="space-y-2 border-t border-border pt-4">
        <Field label="Merge into another merchant (fixes duplicates)" htmlFor="mm">
          <Select id="mm" value={into} onChange={(e) => setInto(e.target.value)}>
            <option value="">Choose…</option>
            {app.merchants.filter((m) => m.id !== merchant.id).map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </Field>
        <Button variant="outline" className="w-full" disabled={!into || a.pending} onClick={() => a.run(() => mergeMerchant(merchant.id, into), onDone)}>
          Merge {uses} transaction{uses === 1 ? "" : "s"} and remove {merchant.name}
        </Button>
      </div>
      <Button variant="danger" className="w-full" onClick={() => (confirm ? a.run(() => deleteMerchant(merchant.id), onDone) : setConfirm(true))}>
        {confirm ? "Tap again: transactions keep their data but lose the merchant" : "Delete merchant"}
      </Button>
    </div>
  );
}
