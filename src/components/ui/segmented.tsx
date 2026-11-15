"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Pill radio group. The selected pill slides between options (the global reduced-motion rule turns the slide off). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  className,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
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
    <div ref={root} role="radiogroup" aria-label={ariaLabel} className={cn("relative inline-flex rounded-full border border-border bg-surface-2 p-1", className)}>
      {box ? (
        <span
          aria-hidden
          className={cn("pointer-events-none absolute inset-y-1 rounded-full bg-text", animate && "transition-[left,width] duration-200 ease-out")}
          style={{ left: box.left, width: box.width }}
        />
      ) : null}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative z-10 rounded-full px-3.5 font-medium transition-colors",
            size === "sm" ? "h-8 text-xs" : "h-9 text-sm",
            value === o.value ? (box ? "text-bg" : "bg-text text-bg") : "text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
