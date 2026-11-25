"use client";

/**
 * On-screen number pad for an amount field on touch devices.
 * Source: Kokonut UI "Amount Pad" (https://kokonutui.com/r/amount-pad.json, MIT, @dorianbaffier),
 * copied 2026-11-25. Kokonut has no versioned releases; this file is ours now.
 * Changes from the original: it drives an existing amount <input> (controlled string value) instead of
 * owning the amount, so the field, validation and tests stay as they were. Kept the key layout, the
 * typing rules (one decimal point, two decimals, 7 whole digits, a lone 0 is replaced) and the shake on
 * a refused key. Dropped the recipient header, presets, send button, balance cap and the animated
 * glyph display. App tokens instead of zinc/dark: classes; the shake uses the Web Animations API and is
 * skipped under reduced motion.
 */

import { Delete } from "lucide-react";
import type { RefObject } from "react";
import { cn } from "@/lib/utils";

const MAX_WHOLE_DIGITS = 7;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;
const KEY_LABELS: Record<string, string> = { back: "Delete", ".": "Decimal point" };

/** What typing `key` does to `value`: the new string, or null if it can't take it. */
export function typeKey(value: string, key: string): string | null {
  if (key === "back") return value.slice(0, -1);
  const point = value.indexOf(".");
  if (key === ".") {
    if (point !== -1) return null;
    return value === "" ? "0." : `${value}.`;
  }
  if (point !== -1 && value.length - point > 2) return null;
  if (point === -1 && value.length >= MAX_WHOLE_DIGITS) return null;
  // A lone leading zero is replaced, not followed.
  return value === "0" ? key : value + key;
}

// Keys never take focus from the amount field, so the pad stays open and the caret stays put.
const keepFocus = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault();

export function AmountPad({
  value,
  onChange,
  onDone,
  target,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onDone: () => void;
  /** The field the pad types into: it shakes when a key is refused. */
  target: RefObject<HTMLElement | null>;
  className?: string;
}) {
  function press(key: string) {
    const next = typeKey(value, key);
    if (next !== null) return onChange(next);
    const el = target.current;
    if (el && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.animate({ transform: ["translateX(0)", "translateX(-8px)", "translateX(7px)", "translateX(-5px)", "translateX(3px)", "translateX(0)"] }, { duration: 360, easing: "ease-out" });
    }
  }

  return (
    <div role="group" aria-label="Amount keypad" className={cn("grid grid-cols-3 gap-1", className)}>
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          aria-label={KEY_LABELS[key] ?? key}
          onPointerDown={keepFocus}
          onMouseDown={keepFocus}
          onClick={() => press(key)}
          className="flex h-12 items-center justify-center rounded-control text-2xl font-medium tabular-nums text-text transition-[background-color] hover:bg-surface-2 active:bg-surface-3"
        >
          {key === "back" ? <Delete aria-hidden size={18} className="text-muted" /> : key}
        </button>
      ))}
      <button
        type="button"
        onPointerDown={keepFocus}
        onMouseDown={keepFocus}
        onClick={onDone}
        className="col-span-3 mt-1 flex h-11 items-center justify-center rounded-control bg-accent/15 text-sm font-medium text-text ring-1 ring-inset ring-accent transition-[background-color] active:bg-accent/25"
      >
        Done
      </button>
    </div>
  );
}
