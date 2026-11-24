import type { ReactNode } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CardLook = { color: string | null; network: string | null; last4: string | null };

/** Generic network marks drawn in code from the face's own text colour: wordmarks and two overlapping rings. No brand logos or colours. */
export function NetworkMark({ network, className }: { network: string | null; className?: string }) {
  const word = "text-base font-bold leading-none";
  if (network === "mastercard")
    return (
      <svg role="img" aria-label="Mastercard" width="44" height="26" viewBox="0 0 44 26" className={cn("shrink-0", className)}>
        <circle cx="15" cy="13" r="12" fill="currentColor" opacity="0.85" />
        <circle cx="29" cy="13" r="12" fill="currentColor" opacity="0.45" />
      </svg>
    );
  if (network === "visa") return <span aria-label="Visa" className={cn(word, "italic", className)}>VISA</span>;
  if (network === "amex") return <span aria-label="American Express" className={cn(word, className)}>AMEX</span>;
  if (network === "discover") return <span aria-label="Discover" className={cn("text-sm font-bold leading-none", className)}>DISCOVER</span>;
  if (network === "other") return <span aria-label="Card network" className={cn("text-sm font-medium leading-none", className)}>CARD</span>;
  return null;
}

/** Fill for a card face: the chosen colour mixed into ink, or plain ink when none is set. Shared by every drawn card. */
export function faceFill(color: string | null): { className: string; style?: { background: string } } {
  const tinted = color && /^c[1-8]$/.test(color);
  return tinted ? { className: "", style: { background: `color-mix(in srgb, var(--${color}) 45%, var(--text))` } } : { className: "bg-text" };
}

/** "XXXX-XXXX-XXXX-1234": the number is never stored, only the last 4 digits are shown. */
export const maskedNumber = (last4: string | null) => `XXXX-XXXX-XXXX-${last4 ?? "XXXX"}`;

/** Share of the limit used as a ring in the face's own text colour, with a tick at the 30% guide. Thin ring, no tone colours. */
function UtilRing({ value }: { value: number }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, value));
  const pct = Math.round(value * 100);
  return (
    <span role="img" aria-label={`${pct}% of limit used`} className="relative ml-auto grid size-11 shrink-0 place-items-center text-bg">
      <svg aria-hidden viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" fill="none" stroke="currentColor" strokeWidth="3">
        <circle cx="22" cy="22" r={r} strokeOpacity="0.25" />
        <circle cx="22" cy="22" r={r} strokeDasharray={`${c * v} ${c}`} strokeLinecap="round" />
        <line x1={22 + r - 4} y1="22" x2={22 + r + 4} y2="22" strokeWidth="1" strokeOpacity="0.7" transform="rotate(108 22 22)" />
      </svg>
      <span className="num text-xs">{pct}%</span>
    </span>
  );
}

/**
 * Payment card drawn in code: flat face (tinted with the card's chosen colour, ink when none), hairline inner frame,
 * chip, contactless mark, masked number and the network mark where a real card prints it. No gradient, no glow.
 */
export function CardFace({ name, limit, look, onEdit, aside, utilization }: { name: string; limit: string | null; look: CardLook; onEdit?: () => void; /** shown top right instead of the edit button, e.g. the amount owed on a stacked card */ aside?: ReactNode; /** share of the limit in use (0..1); draws the ring when set */ utilization?: number | null }) {
  const fill = faceFill(look.color);
  return (
    <div className={cn("relative flex aspect-[1.586/1] w-full flex-col justify-between rounded-card p-compact text-bg ring-1 ring-inset ring-bg/20", fill.className)} style={fill.style}>
      <span aria-hidden className="pointer-events-none absolute inset-2 rounded-inset border border-bg/15" />
      <div className="relative flex items-start justify-between gap-2">
        <p className="min-w-0 truncate font-medium">{name}</p>
        {aside ? (
          <div className="shrink-0 text-bg/85">{aside}</div>
        ) : onEdit ? (
          <Button size="icon" variant="ghost" className="-mr-2 -mt-2 h-9 w-9 text-bg hover:bg-bg/15" aria-label={`Edit ${name}`} onClick={onEdit}>
            <Pencil size={16} />
          </Button>
        ) : null}
      </div>
      <div className="relative flex items-center gap-3 text-bg/70">
        <span aria-hidden className="relative block h-8 w-11 overflow-hidden rounded-inset bg-bg/25 ring-1 ring-inset ring-bg/40">
          <span className="absolute inset-y-0 left-1/3 w-px bg-bg/40" />
          <span className="absolute inset-y-0 right-1/3 w-px bg-bg/40" />
          <span className="absolute inset-x-0 top-1/2 h-px bg-bg/40" />
        </span>
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M8.5 8.5a5 5 0 0 1 0 7" />
          <path d="M12 6a9 9 0 0 1 0 12" />
          <path d="M15.5 3.5a13 13 0 0 1 0 17" />
        </svg>
        {utilization != null ? <UtilRing value={utilization} /> : null}
      </div>
      <p className="money relative text-sm text-bg/85" aria-label={look.last4 ? `Card ending ${look.last4}` : "No card number saved"}>
        {maskedNumber(look.last4)}
      </p>
      <div className="relative flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label text-bg/70">{limit ? "Limit" : "No limit set"}</p>
          {limit ? <p className="money text-lg">{limit}</p> : null}
        </div>
        <NetworkMark network={look.network} className="text-bg" />
      </div>
    </div>
  );
}
