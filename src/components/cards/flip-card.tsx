"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const DEG_PER_PX = 0.6;
const DRAG_START = 6; // px before a press counts as a drag and not a tap
const FLICK = 25; // degrees of turn that still completes a flip on release
const MOUSE_TILT = { y: 20, x: 10 }; // most the card leans toward the mouse, in degrees
const TOUCH_TILT = { y: 14, x: 7 };
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
  const backUp = Math.abs(Math.round(angle / 180)) % 2 === 1;
  const flip = () => setAngle((a) => a + (Math.abs(Math.round(a / 180)) % 2 === 1 ? -180 : 180));

  /** Lean toward where the pointer is: right of centre pushes the right edge away, above centre pushes the top away. */
  function lean(e: ReactPointerEvent<HTMLDivElement>) {
    if (reducedMotion()) return;
    const max = e.pointerType === "mouse" ? MOUSE_TILT : TOUCH_TILT;
    const r = e.currentTarget.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const fy = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setTilt({ y: (fx - 0.5) * 2 * max.y, x: (0.5 - fy) * 2 * max.x });
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
        if (p.moved) setDrag(Math.max(-180, Math.min(180, dx * DEG_PER_PX)));
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
        const turn = drag ?? 0;
        let target = Math.round((angle + turn) / 180) * 180;
        if (target === angle && Math.abs(turn) > FLICK) target = angle + 180 * Math.sign(turn);
        setAngle(target);
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
