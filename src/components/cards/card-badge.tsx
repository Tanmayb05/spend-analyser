import { monogram } from "@/lib/receipts/card";
import { isCardKind, kindMeta } from "@/lib/payment-kinds";
import { cn } from "@/lib/utils";

/**
 * Chip for a payment method: the type's icon, tinted with the method's chart colour. Cards also show the issuer's
 * initials. No brand logos. `filled` washes the whole chip in the colour (used for credit cards in lists).
 */
export function CardBadge({ kind, issuer, nickname, name, color, filled, className }: { kind?: string | null; issuer?: string | null; nickname?: string | null; name: string; color?: string | null; filled?: boolean; className?: string }) {
  const tint = color && /^c[1-8]$/.test(color) ? `var(--${color})` : "var(--chart-muted)";
  const hasColor = Boolean(color && /^c[1-8]$/.test(color));
  const meta = kindMeta(kind);
  const Icon = meta.icon;
  const showMonogram = !kind || isCardKind(meta.value);
  return (
    <span
      aria-hidden
      className={cn("relative inline-flex h-8 w-10 shrink-0 items-center justify-center rounded-inset border border-border bg-surface-2", className)}
      style={filled && hasColor ? { background: `color-mix(in srgb, ${tint} 22%, transparent)`, borderColor: tint } : undefined}
    >
      <Icon size={16} style={{ color: hasColor ? tint : "var(--chart-n2)" }} />
      {showMonogram ? <span className="absolute -bottom-1 -right-1 rounded-full bg-surface-3 px-1 text-xs font-medium leading-4 text-muted ring-1 ring-border">{monogram(issuer, nickname, name)}</span> : null}
    </span>
  );
}
