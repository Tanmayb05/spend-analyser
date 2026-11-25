"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bottom sheet on phones, centered dialog on larger screens. Built on <dialog> for focus + Esc handling.
 * side="left": full-height sheet on phones/tablets; on desktop (lg+) a drawer docked just right of the sidebar.
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

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

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
    <dialog
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
    >
      <div className={cn("flex flex-col", side === "bottom" ? "max-h-[92dvh]" : "h-full")}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-card py-4">
          <h2 id={titleId} className="text-lg font-medium">{title}</h2>
          <div className="flex items-center gap-1">
            {actions}
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-control transition-colors hover:bg-surface-3">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className={cn("min-h-0", bare ? "flex flex-1 flex-col" : "overflow-y-auto overscroll-contain px-card pt-card pb-safe", !bare && side === "left" && "flex-1")}>{children}</div>
      </div>
    </dialog>
  );
}
