import { ChartNoAxesColumn, House, List, Plane, Receipt, Settings, Sparkles, CalendarClock } from "lucide-react";

export const NAV = [
  { href: "/", label: "Overview", icon: House },
  { href: "/transactions", label: "Transactions", icon: List },
  { href: "/trips", label: "Trips", icon: Plane },
  { href: "/plans", label: "Plans & EMIs", icon: CalendarClock },
  { href: "/items", label: "Items", icon: Receipt },
  { href: "/insights", label: "Insights", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export const MOBILE_PRIMARY = ["/", "/transactions", "/trips"] as const;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export { ChartNoAxesColumn };
