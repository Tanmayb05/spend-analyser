import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A heading with an ⓘ that expands a plain-language explanation underneath.
 * Native <details>, so it works without JS and is announced as expandable.
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
  /** Panel floats over content (caller positions it); closes on outside tap / Esc via useCloseOverlays. */
  overlay?: boolean;
}) {
  if (!info) return <Tag className={className}>{children}</Tag>;
  return (
    <details className="group min-w-0" data-overlay={overlay || undefined}>
      <summary className="flex w-fit max-w-full cursor-pointer list-none items-center gap-1.5 rounded-lg outline-offset-4 [&::-webkit-details-marker]:hidden">
        <Tag className={cn("min-w-0", className)}>{children}</Tag>
        <Info size={15} strokeWidth={2} aria-hidden className="shrink-0 text-muted transition-colors group-open:text-accent group-hover:text-text" />
        <span className="sr-only">(what is this?)</span>
      </summary>
      <div className={cn("mt-2 space-y-2 rounded-2xl bg-surface-2 px-3.5 py-3 text-sm font-normal normal-case leading-relaxed tracking-normal text-muted [&_b]:font-medium [&_b]:text-text", panelClassName)}>
        {info}
      </div>
    </details>
  );
}

