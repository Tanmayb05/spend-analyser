"use client";
import { useEffect, useRef, type ReactNode } from "react";
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
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  className?: string;
  side?: "bottom" | "left";
  /** extra header controls, shown left of the close button */
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

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
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        side === "bottom"
          ? ["m-0 mt-auto w-full max-w-none rounded-t-[28px] border border-border bg-surface p-0 text-text", "sm:m-auto sm:max-w-lg sm:rounded-[28px]"]
          : [
              "sheet-left m-0 mt-auto h-[92dvh] max-h-none w-full max-w-none rounded-t-[28px] border border-border bg-surface p-0 text-text",
              // desktop: sidebar is lg:p-4 + w-20 + lg:gap-4, so the panel starts where page content does
              "lg:my-4 lg:ml-28 lg:mr-0 lg:h-[calc(100dvh-2rem)] lg:w-[420px] lg:rounded-[28px] lg:shadow-2xl",
            ],
        className,
      )}
    >
      <div className={cn("flex flex-col", side === "bottom" ? "max-h-[92dvh]" : "h-full")}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-lg font-medium">{title}</h2>
          <div className="flex items-center gap-1">
            {actions}
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-3">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className={cn("overflow-y-auto px-5 py-5 pb-safe", side === "left" && "flex-1")}>{children}</div>
      </div>
    </dialog>
  );
}
