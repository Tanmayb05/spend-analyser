"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Keyboard, Plus, Search } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { ShortcutHint } from "@/components/ui/kbd";
import { useAppData } from "@/components/app-data";
import { NAV } from "@/components/shell/nav";
import { SETTINGS_GROUPS } from "@/components/settings/nav";
import { GO_TO } from "@/lib/shortcuts/commands";
import { cn } from "@/lib/utils";

type Item = { key: string; group: string; label: string; keywords?: string; icon?: React.ComponentType<{ size?: number; className?: string }>; command?: string; run: () => void };

/** Matches when every typed word appears somewhere in the label, group or keywords. */
export function matches(item: Pick<Item, "label" | "group" | "keywords">, query: string): boolean {
  const hay = `${item.label} ${item.group} ${item.keywords ?? ""}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

/** ⌘K / Ctrl+K: type to jump to any page or setting, or run an action. Each row shows its own shortcut. */
export function CommandPalette({ open, onClose, onShowHelp }: { open: boolean; onClose: () => void; onShowHelp: () => void }) {
  const router = useRouter();
  const app = useAppData();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => router.push(href);
    const icon = (href: string) => NAV.find((n) => n.href === href)?.icon;
    return [
      { key: "txn.new", group: "Actions", label: "Add a transaction", keywords: "new expense income entry", icon: Plus, command: "txn.new", run: () => app.openTxnSheet() },
      { key: "help.open", group: "Actions", label: "Show keyboard shortcuts", keywords: "keys help hotkeys", icon: Keyboard, command: "help.open", run: onShowHelp },
      ...GO_TO.map((g) => ({ key: g.id, group: "Go to", label: g.label, icon: icon(g.href), command: g.id, run: go(g.href) })),
      ...SETTINGS_GROUPS.flatMap((grp) =>
        grp.items.map((s) => ({ key: s.href, group: "Settings", label: s.label, keywords: `${grp.title} ${s.desc}`, icon: s.icon, run: go(s.href) })),
      ),
    ];
  }, [router, app, onShowHelp]);

  const shown = useMemo(() => items.filter((i) => matches(i, q)), [items, q]);
  const current = Math.min(activeIdx, Math.max(0, shown.length - 1));

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // keep the highlighted row in view
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-idx="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const close = () => {
    onClose();
    setQ("");
    setActiveIdx(0);
  };
  const choose = (item: Item | undefined) => {
    if (!item) return;
    close();
    // after the dialog has closed and handed focus back, so navigation's focus move wins
    setTimeout(item.run, 0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const n = shown.length;
    if (!n) return;
    const to = { ArrowDown: current + 1, ArrowUp: current - 1, Home: 0, End: n - 1, PageDown: current + 5, PageUp: current - 5 }[e.key];
    if (to !== undefined) {
      e.preventDefault();
      setActiveIdx(Math.max(0, Math.min(n - 1, to)));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(shown[current]);
    }
  };

  let lastGroup = "";
  return (
    <Sheet open={open} onClose={close} title="Command menu" bare className="sm:max-w-xl">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative border-b border-border px-card py-3">
          <Search size={16} aria-hidden className="pointer-events-none absolute left-8 top-1/2 -translate-y-1/2 text-faint" />
          <input
            ref={input}
            role="combobox"
            aria-label="Search pages, settings and actions"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={shown[current] ? `${listId}-${current}` : undefined}
            autoComplete="off"
            spellCheck={false}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActiveIdx(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Go to a page or setting, or run an action"
            className="h-11 w-full rounded-control border border-border bg-surface-2 pl-10 pr-4 text-base text-text outline-none transition-[border-color,box-shadow] placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <div ref={list} id={listId} role="listbox" aria-label="Results" className="max-h-[min(60dvh,28rem)] min-h-0 overflow-y-auto overscroll-contain p-2">
          {shown.length === 0 ? <p className="px-3 py-6 text-center text-sm text-muted">Nothing matches “{q}”</p> : null}
          {shown.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            const Icon = item.icon;
            return (
              <div key={item.key}>
                {header ? (
                  <div role="presentation" className="text-label px-3 pb-1 pt-3 text-faint first:pt-1">
                    {header}
                  </div>
                ) : null}
                <div
                  id={`${listId}-${i}`}
                  data-idx={i}
                  role="option"
                  aria-selected={i === current}
                  onMouseMove={() => i !== current && setActiveIdx(i)}
                  onClick={() => choose(item)}
                  className={cn("flex h-10 items-center gap-3 rounded-control px-3 text-sm transition-colors", i === current ? "bg-surface-3 text-text ring-1 ring-inset ring-text/10" : "text-muted")}
                >
                  {Icon ? <Icon size={16} className="shrink-0" /> : <span className="w-4" />}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.command ? <ShortcutHint id={item.command} /> : null}
                  {i === current ? <CornerDownLeft size={16} aria-hidden className="shrink-0 text-faint" /> : null}
                </div>
              </div>
            );
          })}
        </div>
        <p className="hidden border-t border-border px-card py-2 text-xs text-faint pointer-fine:block">↑ ↓ to move, Enter to open, Esc to close</p>
      </div>
    </Sheet>
  );
}
