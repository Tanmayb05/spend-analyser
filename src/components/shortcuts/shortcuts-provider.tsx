"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppData } from "@/components/app-data";
import { COMMANDS, GO_TO, parseOverrides, resolveBindings, type Command } from "@/lib/shortcuts/commands";
import { ariaKeyShortcut, chordFromEvent, detectPlatform, formatBinding, isCharacterBinding, isCharacterChord, type Platform } from "@/lib/shortcuts/keys";
import { CommandPalette } from "./command-palette";
import { ShortcutsHelp } from "./shortcuts-help";

/** How long the second key of a sequence ("g" then "t") is waited for. */
const SEQUENCE_MS = 1200;

type Handler = () => void;

type Ctx = {
  platform: Platform;
  /** Binding in force per command id ("" = none). */
  bindings: Record<string, string>;
  characterKeys: boolean;
  /** True when a command's shortcut is live (bound, and not switched off with character keys). */
  active: (id: string) => boolean;
  /** "⌘K" / "Ctrl+K" / "G then T", or null when the command has no live shortcut. */
  hint: (id: string) => string | null;
  aria: (id: string) => string | undefined;
  register: (id: string, fn: Handler) => () => void;
  openPalette: () => void;
  openHelp: () => void;
};

const ShortcutsContext = createContext<Ctx | null>(null);

export function useShortcuts() {
  const ctx = useContext(ShortcutsContext);
  if (!ctx) throw new Error("useShortcuts must be used inside ShortcutsProvider");
  return ctx;
}

/** Runs `fn` when the command's shortcut is pressed, while this component is mounted and `enabled`. The newest registration wins. */
export function useShortcut(id: string, fn: Handler, enabled = true) {
  const { register } = useShortcuts();
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!enabled) return;
    return register(id, () => ref.current());
  }, [id, enabled, register]);
}

const noop = () => () => {};

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"].includes(el.type);
  return (el as HTMLElement).isContentEditable;
}

const visible = (el: Element) => el.getClientRects().length > 0 && !el.closest("[inert]");

function openDialog(): HTMLDialogElement | null {
  const all = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]"));
  return all[all.length - 1] ?? null;
}

/** Where list keys and page targets look: the open sheet if there is one, else the page content. */
function scopeRoot(): ParentNode {
  return openDialog() ?? document.getElementById("main") ?? document;
}

function findTarget(name: string): HTMLElement | null {
  const els = Array.from(scopeRoot().querySelectorAll<HTMLElement>(`[data-shortcut="${name}"]`));
  return els.find(visible) ?? null;
}

/** Moves focus to the next/previous row marked data-nav-item (or the first/last with "home"/"end"). */
function moveInList(step: 1 | -1 | "home" | "end") {
  const items = Array.from(scopeRoot().querySelectorAll<HTMLElement>("[data-nav-item]")).filter(visible);
  if (!items.length) return false;
  const current = document.activeElement?.closest<HTMLElement>("[data-nav-item]");
  const i = current ? items.indexOf(current) : -1;
  let to: number;
  if (step === "home") to = 0;
  else if (step === "end") to = items.length - 1;
  else if (i < 0) to = step === 1 ? 0 : items.length - 1;
  else to = Math.min(items.length - 1, Math.max(0, i + step));
  const el = items[to];
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest" });
  return true;
}

/** Number keys press the matching option of the page's tab switch (marked data-shortcut-tabs). */
function switchTab(n: number) {
  const group = Array.from(document.querySelectorAll<HTMLElement>("#main [data-shortcut-tabs]")).find(visible);
  const option = group?.querySelectorAll<HTMLElement>('[role="radio"], [role="tab"]')[n - 1];
  if (!option) return false;
  option.click();
  option.focus();
  return true;
}

export function ShortcutsProvider({ initialPlatform, children }: { initialPlatform: Platform; children: ReactNode }) {
  const app = useAppData();
  const router = useRouter();
  const pathname = usePathname();
  // the server guessed from request headers; the browser's answer wins once hydrated (same value almost always, so no flicker)
  const platform = useSyncExternalStore(noop, () => detectPlatform(navigator as Navigator & { userAgentData?: { platform?: string } }), () => initialPlatform);

  const characterKeys = app.profile.character_keys;
  const bindings = useMemo(() => resolveBindings(parseOverrides(app.profile.shortcut_overrides)), [app.profile.shortcut_overrides]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const handlers = useRef(new Map<string, Handler[]>());
  const register = useCallback((id: string, fn: Handler) => {
    const list = handlers.current.get(id) ?? [];
    list.push(fn);
    handlers.current.set(id, list);
    return () => {
      const l = handlers.current.get(id);
      if (!l) return;
      const i = l.lastIndexOf(fn);
      if (i >= 0) l.splice(i, 1);
    };
  }, []);

  const active = useCallback(
    (id: string) => {
      const b = bindings[id];
      return Boolean(b) && (characterKeys || !isCharacterBinding(b));
    },
    [bindings, characterKeys],
  );

  const ctx = useMemo<Ctx>(
    () => ({
      platform,
      bindings,
      characterKeys,
      active,
      hint: (id) => (active(id) ? formatBinding(bindings[id], platform) : null),
      aria: (id) => (active(id) ? ariaKeyShortcut(bindings[id], platform) : undefined),
      register,
      openPalette: () => setPaletteOpen(true),
      openHelp: () => setHelpOpen(true),
    }),
    [platform, bindings, characterKeys, active, register],
  );

  // global commands
  useEffect(() => {
    const offs = [
      register("palette.open", () => setPaletteOpen((o) => !o)),
      register("help.open", () => setHelpOpen(true)),
      register("txn.new", () => app.openTxnSheet()),
      register("search.focus", () => {
        const el = findTarget("search");
        if (el) el.focus();
        else setPaletteOpen(true);
      }),
      register("list.next", () => moveInList(1)),
      register("list.prev", () => moveInList(-1)),
      ...GO_TO.map((g) => register(g.id, () => router.push(g.href))),
    ];
    return () => offs.forEach((off) => off());
  }, [register, router, app]);

  // the key handler; reads the latest state through a ref so it's attached once
  const state = useRef({ bindings, characterKeys, platform, paletteOpen });
  useEffect(() => {
    state.current = { bindings, characterKeys, platform, paletteOpen };
  });

  useEffect(() => {
    let pending: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clearPending = () => {
      pending = null;
      clearTimeout(timer);
    };

    /** The command to run for these keys, if any. Can't-run-here commands (no handler, no target on the page) don't count. */
    const runnable = (c: Command) => {
      if (c.target) return findTarget(c.target.name) !== null;
      return (handlers.current.get(c.id)?.length ?? 0) > 0;
    };
    const run = (c: Command) => {
      if (c.target) {
        const el = findTarget(c.target.name);
        if (!el) return;
        if (c.target.action === "focus") el.focus();
        else el.click();
        return;
      }
      const list = handlers.current.get(c.id);
      list?.[list.length - 1]?.();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const { bindings, characterKeys, platform, paletteOpen } = state.current;
      const chord = chordFromEvent(e, platform);
      if (!chord) return;

      const typing = isTyping(document.activeElement);
      const dialog = openDialog();
      const plain = isCharacterChord(chord);

      // built-in: arrows / Home / End on a focused list row
      const onRow = document.activeElement?.closest("[data-nav-item]");
      if (onRow && (!dialog || dialog.contains(onRow))) {
        const step = ({ arrowdown: 1, arrowup: -1, home: "home", end: "end" } as const)[chord];
        if (step !== undefined) {
          if (moveInList(step)) e.preventDefault();
          clearPending();
          return;
        }
      }

      if (plain && typing) return clearPending();
      if (plain && !characterKeys) return clearPending();

      const live = COMMANDS.filter((c) => {
        const b = bindings[c.id];
        if (!b) return false;
        // in a sheet, only list movement and closing the command menu with its own key work
        if (dialog && !(c.id === "list.next" || c.id === "list.prev" || (c.id === "palette.open" && paletteOpen))) return false;
        if (typing && c.notInInputs) return false;
        return true;
      });

      const tryKeys = (keys: string) => {
        const exact = live.find((c) => bindings[c.id] === keys && runnable(c));
        if (exact) {
          if (e.repeat && !exact.repeat) return true;
          e.preventDefault();
          clearPending();
          run(exact);
          return true;
        }
        if (!e.repeat && live.some((c) => bindings[c.id].startsWith(`${keys} `))) {
          e.preventDefault();
          clearTimeout(timer);
          pending = keys;
          timer = setTimeout(clearPending, SEQUENCE_MS);
          return true;
        }
        return false;
      };

      if (pending && tryKeys(`${pending} ${chord}`)) return;
      clearPending();
      if (tryKeys(chord)) return;

      // built-in: 1–9 switch the page's tabs
      if (plain && !dialog && /^[1-9]$/.test(chord) && switchTab(Number(chord))) e.preventDefault();
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearPending();
    };
  }, []);

  // after moving to another page, put keyboard focus on its heading so Tab starts from the content, not the sidebar
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    const id = requestAnimationFrame(() => {
      const activeEl = document.activeElement;
      const main = document.getElementById("main");
      if (!main || openDialog() || (activeEl && activeEl !== document.body && main.contains(activeEl))) return;
      const heading = main.querySelector<HTMLElement>("h1") ?? main;
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return (
    <ShortcutsContext.Provider value={ctx}>
      {children}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onShowHelp={() => setHelpOpen(true)} />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </ShortcutsContext.Provider>
  );
}
