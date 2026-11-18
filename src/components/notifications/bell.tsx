"use client";

import type { ReactNode } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications } from "./notifications-provider";

/** Bell with an unread badge. "sidebar" matches the desktop icon rail; "header" is the compact mobile top-bar button. */
export function NotificationBell({ variant, tip }: { variant: "sidebar" | "header"; tip?: ReactNode }) {
  const { unread, notices, setOpen } = useNotifications();
  const urgent = notices.some((n) => !n.read && n.tone === "bad");
  const label = unread ? `Notifications, ${unread} unread` : "Notifications";
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={label}
      className={cn(
        "group relative grid place-items-center text-muted transition hover:text-text",
        variant === "sidebar" ? "h-12 w-12 rounded-2xl hover:bg-surface-3" : "h-10 w-10 rounded-full border border-border bg-surface hover:bg-surface-2",
      )}
    >
      <Bell size={variant === "sidebar" ? 20 : 18} />
      {unread > 0 ? (
        <span
          aria-hidden
          className={cn(
            "absolute grid min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-semibold leading-[18px] ring-2 ring-surface",
            variant === "sidebar" ? "right-1.5 top-1.5" : "-right-1 -top-1",
            urgent ? "bg-bad text-white" : "bg-accent text-accent-fg",
          )}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
      {tip}
    </button>
  );
}
