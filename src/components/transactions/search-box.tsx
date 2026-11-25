"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, Store, TextCursorInput, X } from "lucide-react";
import { useAppData } from "@/components/app-data";
import { buildSuggestIndex, suggest, type SuggestItem } from "@/lib/analytics/suggest";
import { cn } from "@/lib/utils";
import { ShortcutHint } from "@/components/ui/kbd";
import { useShortcuts } from "@/components/shortcuts/shortcuts-provider";

type Go = (patch: Record<string, string | null>, opts?: { replace?: boolean }) => void;

function Highlight({ text, q }: { text: string; q: string }) {
  const needle = q.trim().toLowerCase();
  const i = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-transparent font-semibold text-accent">{text.slice(i, i + needle.length)}</mark>
      {text.slice(i + needle.length)}
    </>
  );
}

/** Search input with merchant / description suggestions (in-memory index, no extra queries). */
export function SearchBox({ value, descriptions, go }: { value: string; descriptions: string[]; go: Go }) {
  const app = useAppData();
  const keys = useShortcuts();
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const pushed = useRef(value);
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const index = useMemo(() => buildSuggestIndex(app.merchants, descriptions), [app.merchants, descriptions]);
  const items = useMemo(() => suggest(index, q), [index, q]);
  const showList = open && items.length > 0;

  // while typing, the first debounced search adds a history entry and later ones update it,
  // so Back skips the half-typed words; a pick, Enter, clear or blur ends the run
  const typing = useRef(false);
  const push = (patch: Record<string, string | null>, fromTyping = false) => {
    if ("q" in patch) pushed.current = patch.q ?? "";
    go(patch, { replace: fromTyping && typing.current });
    typing.current = fromTyping;
  };

  // debounced free-text search
  useEffect(() => {
    if (q === pushed.current) return;
    const t = setTimeout(() => push({ q: q || null }, true), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // URL changed from elsewhere (e.g. "Clear all"): follow it
  useEffect(() => {
    if (value !== pushed.current) {
      pushed.current = value;
      setQ(value);
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const pick = (item: SuggestItem) => {
    setOpen(false);
    setActive(-1);
    if (item.kind === "merchant") {
      setQ("");
      push({ merchant: item.id, q: null });
    } else {
      setQ(item.text);
      push({ q: item.text });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!items.length) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + step + items.length + (a === -1 && step === -1 ? 1 : 0)) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showList && active >= 0 && items[active]) pick(items[active]);
      else {
        setOpen(false);
        push({ q: q.trim() || null });
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (showList) {
        setOpen(false);
        setActive(-1);
      } else {
        // second Esc leaves the field, so single-key shortcuts work again
        e.currentTarget.blur();
      }
    }
  };

  const firstDescription = items.findIndex((i) => i.kind === "description");
  const hasMerchants = items.some((i) => i.kind === "merchant");

  return (
    <div ref={root} className="relative min-w-48 flex-1">
      <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
      <input
        role="combobox"
        aria-label="Search"
        data-shortcut="search"
        aria-keyshortcuts={keys.aria("search.focus")}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => (typing.current = false)}
        onKeyDown={onKeyDown}
        placeholder="Search"
        className="h-10.5 w-full rounded-control border border-border bg-surface-2 pl-10 pr-10 text-sm outline-none transition-colors placeholder:text-faint focus:border-accent"
      />
      {!q ? <ShortcutHint id="search.focus" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" /> : null}
      {q ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => { setQ(""); setOpen(false); setActive(-1); push({ q: null }); }}
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-inset text-faint transition-colors hover:text-text"
        >
          <X size={16} />
        </button>
      ) : null}
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search suggestions"
          className="absolute inset-x-0 top-full z-20 mt-2 max-h-80 overflow-y-auto rounded-control border border-border bg-surface-2 p-1 shadow-pop"
        >
          {items.map((item, i) => (
            <li key={`${item.kind}-${item.text}`} role="presentation">
              {i === 0 && hasMerchants ? <SectionLabel>Merchants</SectionLabel> : null}
              {i === firstDescription ? <SectionLabel>Descriptions</SectionLabel> : null}
              <div
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(item)}
                className={cn("flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2 text-sm", i === active ? "bg-surface-3 text-text" : "text-muted")}
              >
                {item.kind === "merchant" ? <Store size={16} className="shrink-0 text-faint" /> : <TextCursorInput size={16} className="shrink-0 text-faint" />}
                <span className="min-w-0 flex-1 truncate">
                  <Highlight text={item.text} q={q} />
                </span>
                {item.kind === "merchant" ? <span className="shrink-0 text-xs text-faint">filter</span> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-3 pb-1 pt-2 text-label text-faint">{children}</p>;
}
