import { House, Lightbulb, List, Plane, Receipt, Settings } from "lucide-react";

export const NAV = [
  { href: "/", label: "Overview", icon: House },
  { href: "/transactions", label: "Transactions", icon: List },
  { href: "/trips", label: "Trips", icon: Plane },
  { href: "/items", label: "Items", icon: Receipt },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export const MOBILE_PRIMARY = ["/", "/transactions", "/trips"] as const;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** One row in the desktop sidebar: 36 tall, icon (18) in one column, label on one line. Shared by nav links, the bell and sign out. */
export const SIDE_ROW = "flex h-9 w-full items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors";
export const SIDE_ROW_IDLE = "text-muted hover:bg-surface-3 hover:text-text";
export const SIDE_ROW_ACTIVE = "bg-surface-3 text-text ring-1 ring-inset ring-text/10";
