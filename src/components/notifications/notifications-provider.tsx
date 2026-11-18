"use client";

import { createContext, use, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { dismissNotice, markNoticesRead, restoreNotice, snoozeNotice } from "@/app/(app)/notifications/actions";
import type { Notice } from "@/lib/notifications/types";

type Hidden = "dismissed" | "snoozed";
type Override = { read?: boolean; hidden?: Hidden };
export type ListedNotice = Notice & { hidden?: Hidden };

type Ctx = {
  source: Promise<Notice[]>;
  overrides: Map<string, Override>;
  /** hidden this session: still listed (as an undo row) until the panel closes */
  recent: Set<string>;
  open: boolean;
  setOpen: (v: boolean) => void;
  markRead: (ids: string[]) => void;
  hide: (id: string, how: "dismiss" | { snoozeDays: number }) => void;
  restore: (id: string) => void;
};

const NotificationsContext = createContext<Ctx | null>(null);

/**
 * Notices are computed on the server (src/lib/data/notifications.ts) and streamed in as a promise, so the
 * shell renders without waiting for them. Read/dismiss/snooze apply optimistically, then persist.
 */
export function NotificationsProvider({ source, children }: { source: Promise<Notice[]>; children: ReactNode }) {
  const [overrides, setOverrides] = useState<Map<string, Override>>(() => new Map());
  const [recent, setRecent] = useState<Set<string>>(() => new Set());
  const [open, setOpenState] = useState(false);

  const patch = useCallback((ids: string[], p: Override | ((o: Override) => Override)) => {
    setOverrides((m) => {
      const next = new Map(m);
      for (const id of ids) {
        const cur = next.get(id) ?? {};
        next.set(id, typeof p === "function" ? p(cur) : { ...cur, ...p });
      }
      return next;
    });
  }, []);

  const persist = useCallback(async (run: () => Promise<{ ok: true } | { ok: false; error: string }>, revert: () => void) => {
    const r = await run().catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Something went wrong" }));
    if (!r.ok) {
      revert();
      toast.error(r.error || "Couldn't update the notification");
    }
  }, []);

  const markRead = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      patch(ids, { read: true });
      void persist(
        () => markNoticesRead(ids),
        () => patch(ids, (o) => ({ ...o, read: undefined })),
      );
    },
    [patch, persist],
  );

  const hide = useCallback(
    (id: string, how: "dismiss" | { snoozeDays: number }) => {
      patch([id], { hidden: how === "dismiss" ? "dismissed" : "snoozed" });
      setRecent((s) => new Set(s).add(id));
      void persist(
        () => (how === "dismiss" ? dismissNotice(id) : snoozeNotice(id, how.snoozeDays)),
        () => patch([id], (o) => ({ ...o, hidden: undefined })),
      );
    },
    [patch, persist],
  );

  const restore = useCallback(
    (id: string) => {
      const prev = overrides.get(id)?.hidden;
      patch([id], (o) => ({ ...o, hidden: undefined }));
      void persist(
        () => restoreNotice(id),
        () => patch([id], (o) => ({ ...o, hidden: prev })),
      );
    },
    [overrides, patch, persist],
  );

  const setOpen = useCallback((v: boolean) => {
    setOpenState(v);
    if (!v) setRecent(new Set());
  }, []);

  const value = useMemo<Ctx>(
    () => ({ source, overrides, recent, open, setOpen, markRead, hide, restore }),
    [source, overrides, recent, open, setOpen, markRead, hide, restore],
  );
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used inside NotificationsProvider");
  return ctx;
}

/** The notice list with local changes applied. Suspends until the server data arrives: wrap callers in <Suspense>. */
export function useNoticeList(): { notices: ListedNotice[]; unread: number } {
  const { source, overrides, recent } = useNotifications();
  const base = use(source);
  return useMemo(() => {
    const notices: ListedNotice[] = [];
    for (const n of base) {
      const o = overrides.get(n.id);
      if (o?.hidden && !recent.has(n.id)) continue;
      notices.push({ ...n, read: o?.read ?? n.read, hidden: o?.hidden });
    }
    return { notices, unread: notices.filter((n) => !n.read && !n.hidden).length };
  }, [base, overrides, recent]);
}
