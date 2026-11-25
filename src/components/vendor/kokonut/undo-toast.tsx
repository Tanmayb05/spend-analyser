"use client";

/**
 * Undo toast with a draining countdown ring.
 * Source: Kokonut UI "Undo Button" (https://kokonutui.com/r/undo-button.json, MIT, @dorianbaffier),
 * copied 2026-11-25. Kokonut has no versioned releases; this file is ours now.
 * Changes from the original: it starts in the "pending" phase (the delete has already happened) and
 * lives inside a sonner custom toast that it dismisses itself; app tokens instead of zinc/dark: classes;
 * Motion `m.*` with app timing; the width morph and blur were dropped.
 * Kept: the pill outline that drains clockwise back to the top centre, the rolling seconds,
 * hover and hidden-tab pausing the clock, and Cmd/Ctrl+Z outside text fields.
 */

import { Undo2 } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DUR, EASE_UI } from "@/lib/motion";

const STROKE = 1.5;

/** How long a delete can be undone, in ms. */
export const UNDO_MS = 5000;

// A pill outline that starts at the top centre and runs clockwise, so the countdown drains back toward where it began.
function pillPath(width: number, height: number) {
  const s = STROKE / 2;
  const r = height / 2 - s;
  const left = s + r;
  const right = width - s - r;
  return [`M ${width / 2} ${s}`, `H ${right}`, `A ${r} ${r} 0 0 1 ${right} ${height - s}`, `H ${left}`, `A ${r} ${r} 0 0 1 ${left} ${s}`, "Z"].join(" ");
}

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

function UndoToast({ id, message, duration, onUndo }: { id: string | number; message: string; duration: number; onUndo: () => void }) {
  const [seconds, setSeconds] = useState(Math.ceil(duration / 1000));
  // toasts only render in the browser, after a delete, so navigator is always there
  const [isMac] = useState(() => /Mac|iPhone|iPad/.test(navigator.platform));
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const hoveredRef = useRef(false);
  const doneRef = useRef(false);
  const remainingRef = useRef(1);
  const undoRef = useRef(onUndo);

  useEffect(() => {
    undoRef.current = onUndo;
  });

  // Dashes in real lengths rather than pathLength, which Chrome scales inconsistently once the path changes size.
  const paint = useCallback(() => {
    const path = pathRef.current;
    if (!path) return;
    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length * remainingRef.current} ${length}`;
  }, []);

  // Keep the outline glued to the button as it lays out.
  useLayoutEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    const observer = new ResizeObserver(() => {
      pathRef.current?.setAttribute("d", pillPath(button.offsetWidth, button.offsetHeight));
      paint();
    });
    observer.observe(button);
    return () => observer.disconnect();
  }, [paint]);

  const undo = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    toast.dismiss(id);
    undoRef.current();
  }, [id]);

  useEffect(() => {
    let elapsed = 0;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      // Hovering the toast, or leaving the tab, holds the clock: nobody should lose their chance to undo while reading it.
      if (!(hoveredRef.current || document.hidden)) elapsed += now - last;
      last = now;
      const left = Math.max(0, duration - elapsed);
      remainingRef.current = left / duration;
      paint();
      setSeconds(Math.ceil(left / 1000));
      if (left === 0) {
        doneRef.current = true;
        toast.dismiss(id);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !isEditable(e.target)) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [duration, id, paint, undo]);

  const hover = (e: React.PointerEvent, value: boolean) => {
    if (e.pointerType === "mouse") hoveredRef.current = value;
  };

  return (
    <div
      onPointerEnter={(e) => hover(e, true)}
      onPointerLeave={(e) => hover(e, false)}
      className="flex w-[var(--width)] max-w-full items-center gap-3 rounded-control border border-border bg-surface-3 py-2 pl-4 pr-2 text-sm text-text shadow-pop"
    >
      <span className="min-w-0 flex-1 truncate font-medium">{message}</span>
      <kbd className="hidden rounded-inset border border-border px-1 font-sans text-xs text-muted sm:inline">{isMac ? "⌘Z" : "Ctrl Z"}</kbd>
      <span className="relative inline-flex shrink-0">
        <button
          ref={buttonRef}
          type="button"
          onClick={undo}
          aria-label={`Undo, ${seconds} second${seconds === 1 ? "" : "s"} left`}
          aria-keyshortcuts={isMac ? "Meta+Z" : "Control+Z"}
          className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface px-4 font-medium text-text transition-[background-color] hover:bg-surface-2"
        >
          <Undo2 aria-hidden size={16} />
          Undo
          <Countdown value={seconds} />
        </button>
        <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
          <path ref={pathRef} className="stroke-text" fill="none" strokeLinecap="round" strokeWidth={STROKE} />
        </svg>
      </span>
    </div>
  );
}

/** Seconds left, rolling up as each one passes (the y slide is dropped under reduced motion by MotionConfig). */
function Countdown({ value }: { value: number }) {
  return (
    <span className="relative inline-flex h-5 min-w-[1ch] justify-center overflow-hidden tabular-nums text-muted">
      <AnimatePresence initial={false} mode="popLayout">
        <m.span
          key={value}
          className="leading-5"
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          transition={{ duration: DUR.base, ease: EASE_UI }}
        >
          {value}
        </m.span>
      </AnimatePresence>
    </span>
  );
}

/** Shows `message` with an Undo pill whose outline drains over `duration`; the toast closes itself when it runs out. */
export function showUndoToast(message: string, onUndo: () => void, duration = UNDO_MS) {
  return toast.custom((id) => <UndoToast id={id} message={message} duration={duration} onUndo={onUndo} />, {
    duration: Infinity,
    className: "!bg-transparent !border-0 !p-0 !shadow-none",
  });
}
