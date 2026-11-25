"use client";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Radio group as a segmented control: a raised surface step with a hairline marks the selected option and slides between options
 * (the global reduced-motion rule turns the slide off). Radius is nested: outer control radius minus the 4px padding.
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
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  // measure the selected pill; animate only after the first measurement so it doesn't slide in on load
  useLayoutEffect(() => {
    const el = root.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (el) setBox({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, options.length, size]);
  // re-measure when the pills resize (responsive padding, font load) so the indicator doesn't go stale
  useLayoutEffect(() => {
    const root_ = root.current;
    if (!root_ || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const el = root_.querySelector<HTMLElement>('[aria-checked="true"]');
      if (el) setBox((b) => (b && b.left === el.offsetLeft && b.width === el.offsetWidth ? b : { left: el.offsetLeft, width: el.offsetWidth }));
    });
    ro.observe(root_);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (box) {
      const id = requestAnimationFrame(() => setAnimate(true));
      return () => cancelAnimationFrame(id);
    }
  }, [box]);

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
      {box ? (
        <span
          aria-hidden
          className={cn("pointer-events-none absolute inset-y-1 left-0 rounded-(--seg-radius) bg-accent/15 ring-1 ring-inset ring-accent", animate && "transition-[transform,width] duration-(--dur-base)")}
          style={{ transform: `translateX(${box.left}px)`, width: box.width }}
        />
      ) : null}
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={value === o.value || (i === 0 && !options.some((x) => x.value === value)) ? 0 : -1}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative z-10 whitespace-nowrap rounded-(--seg-radius) px-3 font-medium transition-colors",
            compact && "max-sm:px-1.5 max-sm:text-xs",
            size === "sm" ? "h-8 text-xs" : "h-9 text-sm",
            value === o.value ? (box ? "text-text" : "bg-accent/15 text-text ring-1 ring-inset ring-accent") : "text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
