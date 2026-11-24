import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** A tap target for picking one value from a short list (category, date). Selected = accent outline on an accent tint, so it reads at a glance. */
export function Chip({ selected, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex h-9 max-w-full items-center rounded-control border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        selected ? "border-accent bg-accent/15 text-text" : "border-border bg-surface-2 text-muted hover:bg-surface-3 hover:text-text",
        className,
      )}
      {...props}
    >
      <span className="truncate">{props.children}</span>
    </button>
  );
}
