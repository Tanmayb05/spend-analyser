import { faceFill, NetworkMark } from "./card-face";
import { cn } from "@/lib/utils";

/** A payment card at thumbnail size: the card's own colour, a chip, its network mark and the last 4 digits. Drawn in code, no brand logos. */
export function MiniCard({ color, network, last4, className }: { color: string | null; network: string | null; last4: string | null; className?: string }) {
  const fill = faceFill(color);
  return (
    <span aria-hidden className={cn("relative flex aspect-[1.586/1] w-16 shrink-0 flex-col justify-between rounded-inset p-1.5 text-bg ring-1 ring-inset ring-bg/20", fill.className, className)} style={fill.style}>
      <span className="flex items-start justify-between">
        <span className="h-2.5 w-3.5 rounded-sm bg-bg/30 ring-1 ring-inset ring-bg/40" />
        <NetworkMark network={network} className="h-2.5 w-auto text-xs leading-none" />
      </span>
      {last4 ? <span className="money text-xs leading-none text-bg/85">{`•• ${last4}`}</span> : null}
    </span>
  );
}
