"use client";

/**
 * Back/forward for the Transactions page (todo 7).
 *
 * Every filter, sort, period or tab change is already its own URL. This file adds the parts that made
 * Back feel wrong:
 *  - scroll position comes back with the filters you return to (`useBackNavScroll`)
 *  - typing a search adds one history entry, not one per pause (`useFilterNav` with `replace`)
 *  - Back closes an open sheet instead of changing the page behind it (`useBackSheet`)
 *
 * Kill switch: set BACK_NAV to false and everything here falls back to the previous behaviour
 * (plain router.push, sheets ignore Back, no scroll memory).
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useParamHref } from "@/components/dashboard/dashboard-header";

export const BACK_NAV = true;

const SCROLL_KEY = "back-nav:scroll";
const MAX_SAVED = 60;
const here = () => location.pathname + location.search;
const sheetOnTop = (id: string) => (history.state as { __sheet?: string } | null)?.__sheet === id;
// module-level so a Back that switches tabs (and remounts the hook) still restores
const restoring = { current: false };
const last = { current: "" };

function readScroll(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(SCROLL_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function saveScroll(url: string, y: number) {
  try {
    const m = readScroll();
    delete m[url]; // re-insert so the newest stays last when trimming
    m[url] = Math.round(y);
    const keys = Object.keys(m);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_SAVED))) delete m[k];
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify(m));
  } catch {
    /* storage unavailable: Back still works, just without scroll memory */
  }
}

/** Patch the current query string; `replace` updates this history entry instead of adding one. */
export function useFilterNav() {
  const router = useRouter();
  const href = useParamHref();
  return useCallback(
    (patch: Record<string, string | null>, opts?: { replace?: boolean }) => {
      const url = href(patch);
      if (BACK_NAV) saveScroll(here(), scrollY);
      if (BACK_NAV && opts?.replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [href, router],
  );
}

/** Remembers scroll per URL on this page and puts it back when you go Back/Forward to that URL. */
export function useBackNavScroll() {
  const pathname = usePathname();
  const sp = useSearchParams();

  useEffect(() => {
    if (!BACK_NAV) return;
    let frame = 0;
    const onScroll = () => {
      if (restoring.current || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        saveScroll(here(), scrollY);
      });
    };
    // a pop to the same URL (e.g. closing a sheet) has nothing to restore
    const onPop = () => {
      if (here() !== last.current) restoring.current = true;
    };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("popstate", onPop);
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("popstate", onPop);
      cancelAnimationFrame(frame);
    };
  }, []);

  // runs once the page for the popped URL has rendered
  useEffect(() => {
    last.current = here();
    if (!BACK_NAV || !restoring.current) return;
    const y = readScroll()[here()];
    const raf = requestAnimationFrame(() => {
      if (y !== undefined) scrollTo({ top: y, behavior: "instant" });
      restoring.current = false;
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname, sp]);
}

/**
 * A sheet that owns a history entry while open, so Back (button, mouse, swipe) closes it.
 * - `show(v)` opens it with value v and adds an entry for the same URL.
 * - `hide()` closes it and removes that entry.
 * - `handOff()` closes it and leaves the entry for the caller to replace (e.g. `go(patch, { replace: true })`),
 *   so "Done" in a filter sheet adds exactly one history step.
 */
export function useBackSheet<T>() {
  const [value, setValue] = useState<T | null>(null);
  const id = useId();
  const open = value !== null;
  // <dialog> fires onClose again when it is closed programmatically; only the first close counts
  const isOpen = useRef(false);

  useEffect(() => {
    if (!BACK_NAV || !open) return;
    const onPop = () => {
      if (!sheetOnTop(id)) {
        isOpen.current = false;
        setValue(null);
      }
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, [open, id]);

  const show = useCallback((v: T) => {
    // keep Next's own state on the entry so its router handles the pop as a same-page step
    if (BACK_NAV && !sheetOnTop(id)) history.pushState({ ...(history.state ?? {}), __sheet: id }, "", location.href);
    isOpen.current = true;
    setValue(v);
  }, [id]);

  const hide = useCallback(() => {
    if (!isOpen.current) return;
    isOpen.current = false;
    setValue(null);
    if (BACK_NAV && sheetOnTop(id)) history.back();
  }, [id]);

  const handOff = useCallback(() => {
    isOpen.current = false;
    setValue(null);
  }, []);

  return { value, open, show, hide, handOff };
}
