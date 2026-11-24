"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DRAG_START, MOUSE_TILT, TOUCH_TILT, dragTurn, flipped, isBackUp, leanFor, settleAngle } from "@/lib/flip-card";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Tilt = { y: number; x: number };
const FLAT: Tilt = { y: 0, x: 0 };

/**
 * A two-sided card that turns on its vertical axis. Drag it left or right (mouse or finger) and it follows, then settles
 * on whichever side is nearer; a short drag still completes the turn in the direction you dragged. A tap flips it too.
 * Both faces get the same box. The face turned away is `inert`, so its buttons can't be clicked or tabbed to.
 * Each side is a render function that receives `flip`, for a visible flip button.
 *
 * It leans toward wherever the mouse is over it, or the finger rests on it (the touched side dips away, as if pressed),
 * and settles flat when that ends, so it shows that it turns. Skipped with reduced motion.
 */
export function FlipCard({
  front,
  back,
  className,
}: {
  front: (flip: () => void) => ReactNode;
  back: (flip: () => void) => ReactNode;
  className?: string;
}) {
  const [angle, setAngle] = useState(0); // resting angle, always a multiple of 180
  const [drag, setDrag] = useState<number | null>(null); // live extra turn while a finger or mouse is down
  const [tilt, setTilt] = useState<Tilt>(FLAT); // lean toward the pointer
  const press = useRef<{ x: number; moved: boolean } | null>(null);
  const backUp = isBackUp(angle);
  const flip = () => setAngle(flipped);

  /** Lean toward where the pointer is: right of centre pushes the right edge away, above centre pushes the top away. */
  function lean(e: ReactPointerEvent<HTMLDivElement>) {
    if (reducedMotion()) return;
    const max = e.pointerType === "mouse" ? MOUSE_TILT : TOUCH_TILT;
    const r = e.currentTarget.getBoundingClientRect();
    setTilt(leanFor((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, max));
  }

  return (
    <div
      className={cn("cursor-grab select-none [perspective:1400px] active:cursor-grabbing", className)}
      style={{ touchAction: "pan-y" }} // vertical scroll still works; horizontal moves belong to the card
      onPointerEnter={(e) => e.pointerType === "mouse" && lean(e)}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse" && !press.current) setTilt(FLAT);
      }}
      onPointerDown={(e) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
        lean(e);
        press.current = { x: e.clientX, moved: false };
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (!p) {
          if (e.pointerType === "mouse") lean(e);
          return;
        }
        const dx = e.clientX - p.x;
        if (!p.moved && Math.abs(dx) > DRAG_START) {
          p.moved = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        if (p.moved) setDrag(dragTurn(dx));
        else lean(e);
      }}
      onPointerUp={(e) => {
        const p = press.current;
        press.current = null;
        // the mouse is still over the card, so it keeps leaning; a finger has lifted
        if (e.pointerType === "mouse") lean(e);
        else setTilt(FLAT);
        if (!p) return;
        if (!p.moved) return void flip();
        setAngle(settleAngle(angle, drag ?? 0));
        setDrag(null);
      }}
      onPointerCancel={() => {
        press.current = null;
        setTilt(FLAT);
        setDrag(null);
      }}
    >
      <div
        className={cn("relative h-full [transform-style:preserve-3d]", drag === null && "transition-transform duration-(--dur-slow) ease-ui motion-reduce:transition-none")}
        style={{ transform: `rotateX(${tilt.x}deg) rotateY(${angle + (drag ?? tilt.y)}deg)` }}
      >
        <div inert={backUp} className="absolute inset-0 [backface-visibility:hidden]">
          {front(flip)}
        </div>
        <div inert={!backUp} className="absolute inset-0 [backface-visibility:hidden]" style={{ transform: "rotateY(180deg)" }}>
          {back(flip)}
        </div>
      </div>
    </div>
  );
}
