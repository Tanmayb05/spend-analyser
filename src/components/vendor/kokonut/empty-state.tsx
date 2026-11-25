"use client";

/**
 * Empty state with a small drawing of blank ledger cards and a staggered reveal.
 * Source: Kokonut UI "Empty State" (https://kokonutui.com/r/empty-state.json, MIT, @kokonutui),
 * copied 2026-11-25. Kokonut has no versioned releases; this file is ours now.
 * Changes from the original: kept only the drawing (two cards fanned behind a dashed one, spreading
 * when the action is hovered or focused) and the text reveal. Dropped the demo project list, the
 * purple-to-pink gradient tile, rounded-[24px], blur filters and zinc/dark: colours; app tokens and
 * Motion `m.*` with app timing instead. Reduced motion drops the movement through the app's MotionConfig.
 */

import type { ReactNode } from "react";
import { useState } from "react";
import { m } from "motion/react";
import { DUR, EASE_UI } from "@/lib/motion";

const SPREAD = { type: "spring", stiffness: 380, damping: 34 } as const;

const REVEAL = {
  hidden: { opacity: 0, y: 6 },
  shown: { opacity: 1, y: 0, transition: { duration: DUR.slow, ease: EASE_UI } },
};

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  // Hovering or focusing the action fans the cards out a little further.
  const [primed, setPrimed] = useState(false);
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-border px-6 py-12 text-center">
      <Drawing primed={primed} />
      <m.div className="flex flex-col items-center gap-2" initial="hidden" animate="shown" transition={{ staggerChildren: 0.05, delayChildren: 0.1 }}>
        <m.p variants={REVEAL} className="mt-5 text-base font-medium">
          {title}
        </m.p>
        {body ? (
          <m.p variants={REVEAL} className="max-w-sm text-sm text-muted">
            {body}
          </m.p>
        ) : null}
        {action ? (
          <m.div
            variants={REVEAL}
            className="mt-3"
            onPointerEnter={(e) => e.pointerType === "mouse" && setPrimed(true)}
            onPointerLeave={() => setPrimed(false)}
            onFocus={() => setPrimed(true)}
            onBlur={() => setPrimed(false)}
          >
            {action}
          </m.div>
        ) : null}
      </m.div>
    </div>
  );
}

/** Two blank cards fanned behind a dashed one with ruled lines. Decorative. */
function Drawing({ primed }: { primed: boolean }) {
  const spread = primed ? 1.35 : 1;
  return (
    <div aria-hidden className="relative h-20 w-36">
      {[-1, 1].map((side) => (
        <m.div
          key={side}
          className="absolute inset-x-4 top-2 h-16 rounded-inset border border-border bg-surface-2"
          initial={{ rotate: 0, x: 0, y: 0 }}
          animate={{ rotate: side * 7.5 * spread, x: side * 20 * spread, y: 4 }}
          transition={SPREAD}
        />
      ))}
      <m.div
        className="absolute inset-x-4 top-0 flex h-[4.5rem] flex-col justify-between rounded-inset border border-dashed border-border bg-surface p-3"
        animate={{ y: primed ? -4 : 0 }}
        transition={SPREAD}
      >
        <span className="size-2 rounded-full bg-accent" />
        <span className="flex flex-col gap-1.5">
          <span className="h-px w-14 bg-border" />
          <span className="h-px w-10 bg-border" />
          <span className="h-px w-12 bg-border" />
        </span>
      </m.div>
    </div>
  );
}
