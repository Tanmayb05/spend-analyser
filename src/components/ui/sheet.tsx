"use client";
import { useEffect, useId, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { animate, m, useDragControls, useMotionValue, useReducedMotion, useTransform, type MotionStyle, type PanInfo } from "motion/react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { DISMISS, DUR, EASE_UI, SPRING_SETTLE } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Bottom sheet on phones, centered dialog on larger screens. Built on <dialog> for focus + Esc handling.
 * side="left": full-height sheet on phones/tablets; on desktop (lg+) a drawer docked just right of the sidebar.
 * Phones, side="bottom": drag the grip/header down to dismiss (past DISMISS.offset px or a DISMISS.velocity flick).
 * Only the header starts a drag, so scrolling the body is never hijacked.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  className,
  side = "bottom",
  actions,
  bare = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  className?: string;
  side?: "bottom" | "left";
  /** extra header controls, shown left of the close button */
  actions?: ReactNode;
  /** no padding or scrolling around the children: they manage their own scroll area and a fixed footer */
  bare?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const isPhone = useMediaQuery("(max-width: 639.98px)");
  const draggable = side === "bottom" && isPhone;
  const reduceMotion = useReducedMotion();
  const dragControls = useDragControls();
  const y = useMotionValue(0);
  // dims the scrim as the sheet is pulled down (dialog::backdrop reads --sheet-drag)
  const dragProgress = useTransform(y, [0, 320], [0, 1], { clamp: true });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      y.jump(0);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, y]);

  const startDrag = (e: ReactPointerEvent) => {
    if (!draggable || (e.target as Element).closest("button, a, input, select, textarea")) return;
    dragControls.start(e);
  };

  const onDragEnd = (_: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    if (info.offset.y > DISMISS.offset || info.velocity.y > DISMISS.velocity) {
      if (reduceMotion) return onClose();
      const h = ref.current?.offsetHeight ?? window.innerHeight;
      void animate(y, h, { duration: DUR.base, ease: EASE_UI }).then(onClose);
    } else {
      void animate(y, 0, SPRING_SETTLE);
    }
  };

  // left drawer leaves the sidebar uncovered; a click there (or anywhere outside the panel) closes it
  useEffect(() => {
    if (side !== "left" || !open) return;
    const onDown = (e: PointerEvent) => {
      const d = ref.current;
      if (!d) return;
      const r = d.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) onClose();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [side, open, onClose]);

  return (
    <m.dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        side === "bottom"
          ? ["m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-panel border border-border bg-surface p-0 text-text", "sm:m-auto sm:max-w-lg sm:rounded-panel"]
          : [
              "sheet-left m-0 mt-auto h-[92dvh] max-h-none w-full max-w-none overflow-hidden rounded-t-panel border border-border bg-surface p-0 text-text",
              // desktop: the panel starts where page content does (--sidebar-offset, set by the app shell)
              "lg:my-4 lg:ml-(--sidebar-offset) lg:mr-0 lg:h-[calc(100dvh-2rem)] lg:w-105 lg:rounded-panel",
            ],
        className,
      )}
      drag={draggable ? "y" : false}
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 1 }}
      dragMomentum={false}
      onDragEnd={onDragEnd}
      style={draggable ? ({ y, "--sheet-drag": dragProgress } as MotionStyle) : undefined}
    >
      <div className={cn("flex flex-col", side === "bottom" ? "max-h-[92dvh]" : "h-full")}>
        {draggable && (
          <div aria-hidden onPointerDown={startDrag} className="flex touch-none justify-center pt-2 pb-1">
            <span className="h-1 w-9 rounded-full bg-text/20" />
          </div>
        )}
        <div
          onPointerDown={startDrag}
          className={cn("flex items-center justify-between gap-3 border-b border-border px-card", draggable ? "touch-none pt-2 pb-4" : "py-4")}
        >
          <h2 id={titleId} className="text-lg font-medium">{title}</h2>
          <div className="flex items-center gap-1">
            {actions}
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-control transition-colors hover:bg-surface-3">
              <X size={18} />
            </button>
          </div>
        </div>
        {/* layoutScroll: layout animations inside (reorder lists) account for this box's scroll offset */}
        <m.div layoutScroll className={cn("min-h-0", bare ? "flex flex-1 flex-col" : "overflow-y-auto overscroll-contain px-card pt-card pb-safe", !bare && side === "left" && "flex-1")}>{children}</m.div>
      </div>
    </m.dialog>
  );
}
