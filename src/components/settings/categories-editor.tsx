"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import { useAction } from "@/hooks/use-action";
import { categoryColor } from "@/components/charts/colors";
import { cn } from "@/lib/utils";
import {
  deleteCategory,
  deleteSubcategory,
  reorderCategories,
  saveCategory,
  saveSubcategory,
  setCategoryArchived,
} from "@/app/(app)/settings/actions";
import type { Category, Subcategory } from "@/lib/data/types";

const SLOTS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"] as const;

export function CategoriesEditor({ categories, subcategories, uses }: { categories: Category[]; subcategories: Subcategory[]; uses: Record<string, number> }) {
  const [editing, setEditing] = useState<Category | "new-expense" | "new-income" | null>(null);
  const a = useAction();

  const move = (list: Category[], i: number, dir: -1 | 1) => {
    const ids = list.map((c) => c.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const others = categories.filter((c) => !ids.includes(c.id)).map((c) => c.id);
    a.run(() => reorderCategories(list[0].kind === "expense" ? [...ids, ...others] : [...others, ...ids]));
  };

  const section = (kind: "expense" | "income") => {
    const list = categories.filter((c) => c.kind === kind);
    return (
      <Card>
        <CardHeader
          title={kind === "expense" ? "Expense categories" : "Income categories"}
          subtitle={kind === "expense" ? "Core = everyday, controllable spending. Turn it off for fixed costs like rent or tuition." : undefined}
          action={
            <Button size="sm" variant="outline" onClick={() => setEditing(kind === "expense" ? "new-expense" : "new-income")}>
              <Plus size={14} /> Add
            </Button>
          }
        />
        <ul className="divide-y divide-border">
          {list.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2 py-2">
              <div className="flex flex-col">
                <button type="button" aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => move(list, i, -1)} className="text-faint hover:text-text disabled:opacity-20"><ArrowUp size={14} /></button>
                <button type="button" aria-label={`Move ${c.name} down`} disabled={i === list.length - 1} onClick={() => move(list, i, 1)} className="text-faint hover:text-text disabled:opacity-20"><ArrowDown size={14} /></button>
              </div>
              <button type="button" onClick={() => setEditing(c)} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-surface-2">
                <span className="h-3.5 w-3.5 shrink-0 rounded-[4px]" style={{ background: categoryColor(c) }} />
                <span className={cn("min-w-0 flex-1", c.archived && "text-faint line-through")}>
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {subcategories.filter((s) => s.category_id === c.id).map((s) => s.name).join(", ") || "No subcategories"}
                  </span>
                </span>
                {kind === "expense" ? <Badge tone={c.is_core ? "accent" : "neutral"}>{c.is_core ? "Core" : "Fixed"}</Badge> : null}
                <span className="hidden text-xs text-muted sm:inline">{uses[c.id] ?? 0} uses</span>
                <ChevronRight size={16} className="text-faint" />
              </button>
            </li>
          ))}
        </ul>
      </Card>
    );
  };

  const current = typeof editing === "object" && editing ? editing : null;
  return (
    <>
      {section("expense")}
      {section("income")}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={current ? `Edit ${current.name}` : "New category"}>
        {editing !== null ? (
          <CategoryForm
            key={current?.id ?? String(editing)}
            category={current}
            kind={current?.kind ?? (editing === "new-income" ? "income" : "expense")}
            categories={categories}
            subcategories={subcategories.filter((s) => s.category_id === current?.id)}
            uses={current ? uses[current.id] ?? 0 : 0}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Sheet>
    </>
  );
}

function CategoryForm({
  category,
  kind: initialKind,
  categories,
  subcategories,
  uses,
  onDone,
}: {
  category: Category | null;
  kind: "expense" | "income";
  categories: Category[];
  subcategories: Subcategory[];
  uses: number;
  onDone: () => void;
}) {
  const [v, setV] = useState({
    name: category?.name ?? "",
    kind: initialKind,
    is_core: category?.is_core ?? initialKind === "expense",
    color: category?.color ?? null,
    description: category?.description ?? "",
  });
  const [newSub, setNewSub] = useState("");
  const [editSub, setEditSub] = useState<{ id: string; name: string } | null>(null);
  const [mergeInto, setMergeInto] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const a = useAction();
  const usedSlots = new Map(categories.filter((c) => c.color && c.id !== category?.id).map((c) => [c.color!, c.name]));

  return (
    <div className="space-y-5">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          a.run(() => saveCategory({ id: category?.id, ...v, description: v.description || null }), onDone);
        }}
      >
        <Field label="Name" htmlFor="cn">
          <Input id="cn" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus={!category} />
        </Field>
        <Segmented
          value={v.kind}
          onChange={(k) => setV({ ...v, kind: k, is_core: k === "expense" ? v.is_core : false })}
          options={[
            { value: "expense", label: "Expense" },
            { value: "income", label: "Income" },
          ]}
        />
        {v.kind === "expense" ? (
          <label className="flex items-start justify-between gap-3 rounded-2xl bg-surface-2 p-4">
            <span>
              <span className="block font-medium">Core spending</span>
              <span className="block text-sm text-muted">Everyday costs you control (groceries, dining). Turn off for fixed costs (rent, tuition, travel).</span>
            </span>
            <input type="checkbox" checked={v.is_core} onChange={(e) => setV({ ...v, is_core: e.target.checked })} className="mt-1 h-6 w-6 accent-[var(--accent)]" />
          </label>
        ) : null}
        <div>
          <p className="mb-2 text-sm text-muted">Chart color</p>
          <div className="flex flex-wrap gap-2">
            {SLOTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setV({ ...v, color: s })}
                title={usedSlots.get(s) ? `Also used by ${usedSlots.get(s)}` : undefined}
                aria-label={`Color ${s}${usedSlots.get(s) ? ` (used by ${usedSlots.get(s)})` : ""}`}
                aria-pressed={v.color === s}
                className={cn("relative h-9 w-9 rounded-xl ring-offset-2 ring-offset-[var(--surface)]", v.color === s && "ring-2 ring-text")}
                style={{ background: `var(--${s})` }}
              >
                {usedSlots.get(s) ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-text" /> : null}
              </button>
            ))}
            <button type="button" onClick={() => setV({ ...v, color: null })} aria-pressed={v.color === null} className={cn("h-9 rounded-xl border border-border px-3 text-xs text-muted", v.color === null && "ring-2 ring-text")}>
              Neutral
            </button>
          </div>
          <p className="mt-2 text-xs text-faint">8 colour-blind-safe colours. A dot means another category already uses it.</p>
        </div>
        <Field label="What belongs here (optional)" htmlFor="cd">
          <Textarea id="cd" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} className="min-h-16" />
        </Field>
        <Button type="submit" className="w-full" disabled={a.pending || !v.name.trim()}>
          {category ? "Save" : "Add category"}
        </Button>
      </form>

      {category ? (
        <>
          <div>
            <p className="mb-2 text-sm font-medium">Subcategories</p>
            <ul className="space-y-1">
              {subcategories.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  {editSub?.id === s.id ? (
                    <form className="flex flex-1 gap-1" onSubmit={(e) => { e.preventDefault(); a.run(() => saveSubcategory({ id: s.id, category_id: category.id, name: editSub.name }), () => setEditSub(null)); }}>
                      <Input autoFocus value={editSub.name} onChange={(e) => setEditSub({ ...editSub, name: e.target.value })} className="h-10" aria-label="Subcategory name" />
                      <Button type="submit" size="icon" variant="ghost" aria-label="Save"><Check size={16} /></Button>
                      <Button size="icon" variant="ghost" aria-label="Cancel" onClick={() => setEditSub(null)}><X size={16} /></Button>
                    </form>
                  ) : (
                    <>
                      <span className="flex-1 rounded-xl bg-surface-2 px-3 py-2 text-sm">{s.name}</span>
                      <Button size="icon" variant="ghost" aria-label={`Rename ${s.name}`} onClick={() => setEditSub({ id: s.id, name: s.name })}><Pencil size={14} /></Button>
                      <Button size="icon" variant="ghost" className="text-bad" aria-label={`Delete ${s.name}`} onClick={() => a.run(() => deleteSubcategory(s.id))}><Trash2 size={14} /></Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); a.run(() => saveSubcategory({ category_id: category.id, name: newSub }), () => setNewSub("")); }}>
              <Input placeholder="New subcategory" value={newSub} onChange={(e) => setNewSub(e.target.value)} className="h-10" aria-label="New subcategory" />
              <Button type="submit" size="sm" disabled={!newSub.trim()}><Plus size={14} /></Button>
            </form>
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <Button variant="outline" className="w-full" onClick={() => a.run(() => setCategoryArchived(category.id, !category.archived), onDone)}>
              {category.archived ? "Restore category" : "Archive (hide from pickers, keep history)"}
            </Button>
            <div className="rounded-2xl border border-bad/30 p-4">
              <p className="text-sm font-medium">Delete category</p>
              {uses > 0 ? (
                <Field label={`${uses} transactions use it. Move them to:`} className="mt-2">
                  <Select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}>
                    <option value="">Choose a category…</option>
                    {categories.filter((c) => c.id !== category.id && c.kind === category.kind).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <p className="mt-1 text-xs text-muted">Not used by any transaction.</p>
              )}
              <Button
                variant="danger"
                className="mt-3 w-full"
                disabled={(uses > 0 && !mergeInto) || a.pending}
                onClick={() => (confirmDelete ? a.run(() => deleteCategory(category.id, mergeInto || null), onDone) : setConfirmDelete(true))}
              >
                {confirmDelete ? "Tap again to confirm" : uses > 0 ? "Merge and delete" : "Delete"}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
