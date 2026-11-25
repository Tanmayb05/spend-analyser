"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { animate, m, useMotionValue, useReducedMotion, useTransform, type PanInfo } from "motion/react";
import { useAppData } from "@/components/app-data";
import { useMediaQuery } from "@/hooks/use-media-query";
import { DISMISS, DUR, EASE_UI, SPRING_SETTLE } from "@/lib/motion";
import { deleteWithUndo } from "./delete-with-undo";

/** Width of the revealed Edit + Delete actions (two 72px buttons). */
const ACTIONS_W = 144;
/** Past this share of the row width, letting go deletes without a tap on Delete. */
const FULL_SWIPE = 0.55;
/** Only one row is open at a time: opening one tells the others to close. */
const OPEN_EVENT = "swipe-row-open";

/**
 * Touch-only swipe on a ledger row: swipe left to reveal Edit and Delete, swipe all the way to delete (with Undo).
 * Direction-locked, so a vertical scroll that starts on a row stays a scroll. Mouse and keyboard keep the plain row
 * (Enter opens the detail sheet, which has Edit and Delete).
 */
export function SwipeRow({ txnId, label, children }: { txnId: string | null; label: string; children: ReactNode }) {
  const coarse = useMediaQuery("(pointer: coarse)");
  if (!coarse || !txnId) return <>{children}</>;
  return (
    <SwipeRowInner txnId={txnId} label={label}>
      {children}
    </SwipeRowInner>
  );
}

function SwipeRowInner({ txnId, label, children }: { txnId: string; label: string; children: ReactNode }) {
  const app = useAppData();
  const router = useRouter();
  const id = useId();
  const reduce = useReducedMotion();
  const rowRef = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const x = useMotionValue(0);
  // the actions fade in as they are uncovered
  const actionsOpacity = useTransform(x, [-ACTIONS_W, -24, 0], [1, 0.4, 0]);

  const settle = (to: number) => (reduce ? x.jump(to) : void animate(x, to, SPRING_SETTLE));
  const close = () => {
    setOpen(false);
    settle(0);
  };

  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id && x.get() !== 0) {
        setOpen(false);
        void animate(x, 0, SPRING_SETTLE);
      }
    };
    window.addEventListener(OPEN_EVENT, onOther);
    return () => window.removeEventListener(OPEN_EVENT, onOther);
  }, [id, x]);

  // while open, a tap anywhere else only closes the row (that tap's click is swallowed, as in iOS Mail)
  useEffect(() => {
    if (!open) return;
    let swallow: ((e: MouseEvent) => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopSwallow = () => {
      if (swallow) window.removeEventListener("click", swallow, true);
      swallow = null;
      clearTimeout(timer);
    };
    const onDown = (e: PointerEvent) => {
      if (rowRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      void animate(x, 0, SPRING_SETTLE);
      swallow = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        stopSwallow();
      };
      window.addEventListener("click", swallow, true);
      // a tap that turns into a scroll never clicks; don't eat a later, unrelated click
      timer = setTimeout(stopSwallow, 600);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      // keep a pending swallow alive briefly: this effect re-runs (open -> false) inside the same tap
    };
  }, [open, x]);

  async function remove() {
    setDeleting(true);
    const ok = await deleteWithUndo([txnId], router.refresh);
    // on success the row leaves the list when the refresh lands; on failure put it back
    if (!ok) {
      setDeleting(false);
      close();
    }
  }

  function onDragStart() {
    dragged.current = true;
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
  }

  function onDragEnd(_: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    const width = rowRef.current?.offsetWidth ?? 360;
    const pos = x.get();
    if (pos < -width * FULL_SWIPE) {
      // full swipe: slide off, then delete
      if (reduce) x.jump(-width);
      else void animate(x, -width, { duration: DUR.base, ease: EASE_UI });
      void remove();
    } else if (pos < -ACTIONS_W / 2 || info.velocity.x < -DISMISS.velocity) {
      setOpen(true);
      settle(-ACTIONS_W);
    } else {
      close();
    }
  }

  return (
    <div ref={rowRef} className="relative overflow-hidden">
      {/* actions sit under the row; hidden from focus and screen readers until revealed */}
      <m.div
        style={{ opacity: actionsOpacity }}
        aria-hidden={!open}
        className="absolute inset-y-0 right-0 flex items-stretch"
      >
        {deleting ? (
          <span className="flex w-screen items-center justify-end bg-bad/15 pr-5 text-sm font-medium text-bad">Deleting</span>
        ) : (
          <>
            <button
              type="button"
              tabIndex={open ? 0 : -1}
              onClick={() => {
                close();
                app.openTxnSheet({ id: txnId });
              }}
              aria-label={`Edit ${label}`}
              className="flex w-18 flex-col items-center justify-center gap-1 bg-surface-3 text-xs font-medium text-text"
            >
              <Pencil size={18} />
              Edit
            </button>
            <button
              type="button"
              tabIndex={open ? 0 : -1}
              onClick={() => void remove()}
              aria-label={`Delete ${label}`}
              className="flex w-18 flex-col items-center justify-center gap-1 bg-bad/15 text-xs font-medium text-bad"
            >
              <Trash2 size={18} />
              Delete
            </button>
          </>
        )}
      </m.div>
      <m.div
        drag={deleting ? false : "x"}
        dragDirectionLock
        dragConstraints={{ right: 0 }}
        dragElastic={{ right: 0 }}
        dragMomentum={false}
        onPointerDown={() => (dragged.current = false)}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        // the tap that ends a drag must not open the row; a tap on an open row just closes it
        onClickCapture={(e) => {
          if (dragged.current || open) {
            e.preventDefault();
            e.stopPropagation();
            dragged.current = false;
            if (open) close();
          }
        }}
        style={{ x }}
        className="relative bg-surface"
      >
        {children}
      </m.div>
    </div>
  );
}
