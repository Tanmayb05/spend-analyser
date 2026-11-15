import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A heading with an ⓘ that opens a plain-language explanation as a floating panel (it overlays what is below,
 * never pushes the card's content down). Native <details>, so it works without JS and is announced as expandable.
 * Closes on an outside tap or Escape (useCloseOverlays).
 */
export function InfoTitle({
  children,
  info,
  as: Tag = "h2",
  className,
  panelClassName,
  overlay = false,
}: {
  children: ReactNode;
  info?: ReactNode;
  as?: "h1" | "h2" | "h3" | "p";
  className?: string;
  panelClassName?: string;
  /** Caller positions the panel (it is anchored to a parent the caller makes `relative`). Default: anchored under the title. */
  overlay?: boolean;
}) {
  if (!info) return <Tag className={className}>{children}</Tag>;
  return (
    <details className={cn("group min-w-0", !overlay && "relative")} data-overlay>
      <summary className="flex w-fit max-w-full cursor-pointer list-none items-center gap-1.5 rounded-lg outline-offset-4 [&::-webkit-details-marker]:hidden">
        <Tag className={cn("min-w-0", className)}>{children}</Tag>
        <Info size={15} strokeWidth={2} aria-hidden className="shrink-0 text-muted transition-colors group-open:text-accent group-hover:text-text" />
        <span className="sr-only">(what is this?)</span>
      </summary>
      <div
        className={cn(
          "z-30 space-y-2 rounded-2xl border border-border bg-surface-3 px-3.5 py-3 text-sm font-normal normal-case leading-relaxed tracking-normal text-muted shadow-xl [&_b]:font-medium [&_b]:text-text",
          !overlay && "absolute left-0 top-full mt-2 w-[min(26rem,calc(100vw-2.5rem))]",
          panelClassName,
        )}
      >
        {info}
      </div>
    </details>
  );
}

