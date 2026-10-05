"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { useAction } from "@/hooks/use-action";
import { deleteListItem, saveListItem, setListItemArchived } from "@/app/(app)/settings/actions";

type Item = { id: string; name: string; archived: boolean; is_self?: boolean; uses: number };

export function ListEditor({ table, items, noun }: { table: "payment_methods" | "people"; items: Item[]; noun: string }) {
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const a = useAction();

  return (
    <Card>
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          a.run(() => saveListItem(table, { name: adding }), () => setAdding(""));
        }}
      >
        <Input placeholder={`New ${noun}`} value={adding} onChange={(e) => setAdding(e.target.value)} aria-label={`New ${noun}`} />
        <Button type="submit" disabled={!adding.trim() || a.pending}>
          <Plus size={16} /> Add
        </Button>
      </form>
      <ul className="divide-y divide-border">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2 py-2.5">
            {editing?.id === it.id ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  a.run(() => saveListItem(table, editing), () => setEditing(null));
                }}
              >
                <Input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-10" aria-label="Name" />
                <Button type="submit" size="icon" variant="ghost" aria-label="Save"><Check size={18} /></Button>
                <Button size="icon" variant="ghost" aria-label="Cancel" onClick={() => setEditing(null)}><X size={18} /></Button>
              </form>
            ) : (
              <>
                <span className={`min-w-0 flex-1 truncate ${it.archived ? "text-faint line-through" : ""}`}>{it.name}</span>
                {it.is_self ? <Badge tone="accent">You</Badge> : null}
                <span className="text-xs text-muted">{it.uses} uses</span>
                <Button size="icon" variant="ghost" aria-label={`Rename ${it.name}`} onClick={() => setEditing({ id: it.id, name: it.name })}><Pencil size={16} /></Button>
                <Button size="icon" variant="ghost" aria-label={it.archived ? "Restore" : "Archive"} title={it.archived ? "Restore" : "Archive (hide from pickers)"} onClick={() => a.run(() => setListItemArchived(table, it.id, !it.archived))}>
                  {it.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                </Button>
                {!it.is_self ? (
                  <Button
                    size={confirmId === it.id ? "sm" : "icon"}
                    variant="ghost"
                    className="text-bad"
                    aria-label={confirmId === it.id ? "Tap again to delete" : `Delete ${it.name}`}
                    onClick={() => (confirmId === it.id ? a.run(() => deleteListItem(table, it.id), () => setConfirmId(null)) : setConfirmId(it.id))}
                  >
                    <Trash2 size={16} />
                    {confirmId === it.id ? "Confirm" : null}
                  </Button>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
