"use client";

import { Suspense } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { SIDE_ROW, SIDE_ROW_IDLE } from "@/components/shell/nav";
import { useNoticeList, useNotifications } from "./notifications-provider";

type Variant = "sidebar" | "header";

/** Bell with an unread badge. "sidebar" is a labeled row in the desktop sidebar; "header" is the compact mobile top-bar button. */
export function NotificationBell({ variant }: { variant: Variant }) {
  return (
    <Suspense fallback={<BellButton variant={variant} unread={0} urgent={false} />}>
      <LiveBell variant={variant} />
    </Suspense>
  );
}

function LiveBell({ variant }: { variant: Variant }) {
  const { notices, unread } = useNoticeList();
  const urgent = notices.some((n) => !n.read && !n.hidden && n.tone === "bad");
  return <BellButton variant={variant} unread={unread} urgent={urgent} />;
}

function BellButton({ variant, unread, urgent }: { variant: Variant; unread: number; urgent: boolean }) {
  const { setOpen } = useNotifications();
  const badge =
    unread > 0 ? (
      <span
        aria-hidden
        className={cn(
          "grid min-w-5 place-items-center rounded-full px-1 text-xs font-medium leading-5",
          variant === "sidebar" ? "ml-auto" : "absolute -right-1 -top-1 ring-2 ring-surface",
          urgent ? "bg-bad text-white" : "bg-accent text-accent-fg",
        )}
      >
        {unread > 9 ? "9+" : unread}
      </span>
    ) : null;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      className={cn(
        variant === "sidebar"
          ? cn(SIDE_ROW, SIDE_ROW_IDLE)
          : "relative grid h-10 w-10 place-items-center rounded-control border border-border bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-text",
      )}
    >
      <Bell size={18} className="shrink-0" />
      {variant === "sidebar" ? "Notifications" : null}
      {badge}
    </button>
  );
}
