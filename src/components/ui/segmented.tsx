"use client";
import { useId, useRef, type CSSProperties, type ReactNode } from "react";
import { m } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Radio group as a segmented control: an accent-tinted pill marks the selected option and slides between options
 * (Motion shared layout via layoutId; MotionConfig reducedMotion="user" turns the slide off). Radius is nested: outer control radius minus the 4px padding.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  compact = false,
  className,
  ariaLabel,
  shortcutTabs = false,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  /** Tighter on phones (smaller text and padding) so a few options fit beside a title or another control. */
  compact?: boolean;
  className?: string;
  ariaLabel?: string;
  /** Number keys 1–9 pick these options (page-level tab switches only; one per page). */
  shortcutTabs?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  // one shared-layout id per control instance, so two Segmented on a page never swap indicators
  const indicatorId = `seg-${useId()}`;

  return (
    <div
      ref={root}
      role="radiogroup"
      aria-label={ariaLabel}
      data-shortcut-tabs={shortcutTabs || undefined}
      onKeyDown={(e) => {
        // radio group keys: arrows move and pick, Tab leaves the group
        const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: "first", End: "last" } as Record<string, number | "first" | "last">)[e.key];
        if (step === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        const i = Math.max(0, options.findIndex((o) => o.value === value));
        const to = step === "first" ? 0 : step === "last" ? options.length - 1 : (i + (step as number) + options.length) % options.length;
        onChange(options[to].value);
        root.current?.querySelectorAll<HTMLElement>('[role="radio"]')[to]?.focus();
      }}
      style={{ "--seg-radius": "calc(var(--radius-control) - 4px)" } as CSSProperties} className={cn("relative inline-flex max-w-full rounded-control border border-border bg-surface-2 p-1", className)}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={value === o.value || (i === 0 && !options.some((x) => x.value === value)) ? 0 : -1}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative whitespace-nowrap rounded-(--seg-radius) px-3 font-medium transition-colors",
            compact && "max-sm:px-1.5 max-sm:text-xs",
            size === "sm" ? "h-8 text-xs" : "h-9 text-sm",
            value === o.value ? "text-text" : "text-muted hover:text-text",
          )}
        >
          {value === o.value ? (
            <m.span
              aria-hidden
              layoutId={indicatorId}
              className="pointer-events-none absolute inset-0 rounded-(--seg-radius) bg-accent/15 ring-1 ring-inset ring-accent"
            />
          ) : null}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
