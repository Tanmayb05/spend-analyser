"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useAppData } from "@/components/app-data";
import { mockNotices } from "@/lib/notifications/mock";
import type { Notice } from "@/lib/notifications/types";

type Ctx = {
  notices: Notice[];
  unread: number;
  open: boolean;
  setOpen: (v: boolean) => void;
  markRead: (ids: string[]) => void;
  markAllRead: () => void;
  /** hide a notice; snooze hides it for `days`, dismiss for good. Returns an undo. */
  hide: (id: string, how: "dismiss" | { snoozeDays: number }) => () => void;
};

const NotificationsContext = createContext<Ctx | null>(null);

/**
 * SKELETON: notices come from mock data and read/dismiss/snooze live in memory only.
 * Phase B swaps this for server-built notices plus the notification_state table.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { today, currency } = useAppData();
  const base = useMemo(() => mockNotices(today, currency), [today, currency]);
  const [read, setRead] = useState<Set<string>>(() => new Set(base.filter((n) => n.read).map((n) => n.id)));
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState(false);

  const notices = useMemo(() => base.filter((n) => !hidden.has(n.id)).map((n) => ({ ...n, read: read.has(n.id) })), [base, hidden, read]);
  const unread = notices.filter((n) => !n.read).length;

  const markRead = useCallback((ids: string[]) => setRead((s) => new Set([...s, ...ids])), []);
  const markAllRead = useCallback(() => setRead(new Set(base.map((n) => n.id))), [base]);
  const hide = useCallback((id: string) => {
    setHidden((s) => new Set(s).add(id));
    return () =>
      setHidden((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
  }, []);

  const value = useMemo<Ctx>(() => ({ notices, unread, open, setOpen, markRead, markAllRead, hide }), [notices, unread, open, markRead, markAllRead, hide]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used inside NotificationsProvider");
  return ctx;
}
