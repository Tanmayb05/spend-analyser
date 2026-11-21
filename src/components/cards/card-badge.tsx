import { CreditCard } from "lucide-react";
import { monogram } from "@/lib/receipts/card";
import { cn } from "@/lib/utils";

/** Generic card chip with the issuer's initials, tinted with the card's chart colour. No brand logos. */
export function CardBadge({ issuer, nickname, name, color, className }: { issuer?: string | null; nickname?: string | null; name: string; color?: string | null; className?: string }) {
  const tint = color && /^c[1-8]$/.test(color) ? `var(--${color})` : "var(--chart-muted)";
  return (
    <span aria-hidden className={cn("relative inline-flex h-8 w-10 shrink-0 items-center justify-center rounded-inset border border-border bg-surface-2", className)}>
      <CreditCard size={16} style={{ color: tint }} />
      <span className="absolute -bottom-1 -right-1 rounded-full bg-surface-3 px-1 text-xs font-medium leading-4 text-muted ring-1 ring-border">{monogram(issuer, nickname, name)}</span>
    </span>
  );
}
