"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { GripVertical } from "lucide-react";
import { useDragControls } from "motion/react";
import { Reorder } from "motion/react-m";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Result = { ok: true } | { ok: false; error: string };

/**
 * A list the user can reorder by dragging a grip (touch or mouse) or with the keyboard (focus the grip, Arrow Up/Down).
 * The new order is saved when a drag ends; if the save fails the list snaps back to the server order.
 * Rows only start a drag from the grip, so taps and scrolls on the rest of the row behave as before.
 */
export function ReorderList<T>({
  items,
  getId,
  getLabel,
  onCommit,
  children,
  className,
  itemClassName,
}: {
  items: T[];
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  /** Saves the full new order of this list's ids. */
  onCommit: (ids: string[]) => Promise<Result>;
  /** Row content; the grip is rendered before it. */
  children: (item: T) => ReactNode;
  className?: string;
  itemClassName?: string;
}) {
  const router = useRouter();
  const serverIds = items.map(getId);
  const serverKey = serverIds.join(",");
  // local order follows the server's until the user moves something; a refresh with a new order resets it
  const [state, setState] = useState({ key: serverKey, order: serverIds });
  if (state.key !== serverKey) setState({ key: serverKey, order: serverIds });
  const order = state.key === serverKey ? state.order : serverIds;
  const byId = new Map(items.map((it) => [getId(it), it]));
  const [announce, setAnnounce] = useState("");
  // onDragEnd runs from a closure made at drag start; read the latest order through a ref
  const orderRef = useRef(order);
  useEffect(() => {
    orderRef.current = order;
  });

  const setOrder = (next: string[]) => setState({ key: serverKey, order: next });

  async function commit(next: string[]) {
    if (next.join(",") === serverKey) return;
    const r = await onCommit(next);
    if (!r.ok) {
      toast.error(r.error);
      setOrder(serverIds);
      return;
    }
    router.refresh();
  }

  function moveBy(id: string, step: -1 | 1) {
    const i = order.indexOf(id);
    const j = i + step;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    const it = byId.get(id);
    if (it) setAnnounce(`${getLabel(it)} moved to position ${j + 1} of ${order.length}`);
    void commit(next);
  }

  return (
    <>
      <Reorder.Group as="ul" axis="y" values={order} onReorder={setOrder} className={cn("relative", className)}>
        {order.map((id) => {
          const it = byId.get(id);
          if (!it) return null;
          return (
            <ReorderRow key={id} id={id} label={getLabel(it)} className={itemClassName} onDrop={() => void commit(orderRef.current)} onMove={(s) => moveBy(id, s)}>
              {children(it)}
            </ReorderRow>
          );
        })}
      </Reorder.Group>
      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </>
  );
}

function ReorderRow({ id, label, className, onDrop, onMove, children }: { id: string; label: string; className?: string; onDrop: () => void; onMove: (step: -1 | 1) => void; children: ReactNode }) {
  const controls = useDragControls();
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      onMove(e.key === "ArrowUp" ? -1 : 1);
    }
  };
  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDrop}
      // lift the dragged row above its neighbours; the surface hides rows sliding underneath
      whileDrag={{ zIndex: 10 }}
      className={cn("relative flex items-center gap-2 bg-surface", className)}
    >
      <button
        type="button"
        aria-label={`Reorder ${label} (arrow keys move it)`}
        title="Drag to reorder, or focus and use the arrow keys"
        onPointerDown={(e) => controls.start(e)}
        onKeyDown={onKey}
        className="grid h-9 w-7 shrink-0 cursor-grab touch-none place-items-center rounded-control text-faint transition-colors hover:text-text active:cursor-grabbing"
      >
        <GripVertical size={16} />
      </button>
      {children}
    </Reorder.Item>
  );
}
