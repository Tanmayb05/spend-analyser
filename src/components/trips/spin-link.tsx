"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { angleDelta, pointerAngle, radiusWeight, releaseSpeed, settleAt, settlePlan, nearestUpright, type Sample } from "@/lib/spin";

const TAP_SLOP = 6; // px of travel before a press counts as a drag (and the click is swallowed)
const HOLD_MS = 200; // touch only: hold this long before the stamp is grabbed, so a swipe still scrolls the page
const HOLD_SLOP = 8; // px of travel during the hold that means "scrolling", not "grabbing"

/**
 * A link that spins like a fridge magnet. Press and drag around its centre and it turns the way your pointer goes (clockwise
 * for clockwise). Let go mid-drag and it keeps spinning, further the harder you flicked, then slows and stops upright.
 * A tap or click still opens the link.
 * On touch screens the stamp is grabbed after a short hold, so swiping past it still scrolls the page.
 */
export function SpinLink({ href, tilt, title, label, children }: { href: string; tilt: number; title: string; label: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const spinner = useRef<HTMLDivElement>(null);
  const s = useRef({ angle: tilt, raf: 0, id: null as number | null, x0: 0, y0: 0, pa: 0, grabbed: false, captured: false, moved: false, hold: 0, samples: [] as Sample[], reduce: false });

  const paint = (lifted: boolean) => {
    if (spinner.current) spinner.current.style.transform = `rotate(${s.current.angle}deg) scale(${lifted ? 1.04 : 1})`;
  };
  const stopCoast = () => {
    cancelAnimationFrame(s.current.raf);
    s.current.raf = 0;
  };
  /** the stamp's centre on screen and its size; the box does not rotate, so this stays put while the stamp turns */
  const centre = () => {
    const r = box.current!.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, size: Math.min(r.width, r.height) };
  };

  useEffect(() => {
    const el = box.current;
    const st = s.current;
    st.reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // once grabbed, the finger must not also scroll the page; this has to be a non-passive native listener
    const block = (e: TouchEvent) => {
      if (st.grabbed && e.cancelable) e.preventDefault();
    };
    el?.addEventListener("touchmove", block, { passive: false });
    return () => {
      el?.removeEventListener("touchmove", block);
      cancelAnimationFrame(st.raf);
      clearTimeout(st.hold);
    };
  }, []);

  const grab = () => {
    const st = s.current;
    st.grabbed = true;
    stopCoast();
    paint(true);
  };
  // Capturing the pointer sends the click to the box instead of the link, so it only happens once the press has turned into a drag.
  const capture = (id: number) => {
    try {
      box.current?.setPointerCapture(id);
    } catch {
      /* pointer already gone */
    }
  };

  const release = (now: number) => {
    const st = s.current;
    clearTimeout(st.hold);
    if (!st.grabbed) return;
    st.grabbed = false;
    st.id = null;
    paint(false);
    const speed = st.reduce ? 0 : releaseSpeed(st.samples, now);
    const from = st.angle;
    const plan = st.reduce ? { target: nearestUpright(from, tilt), seconds: 0 } : settlePlan(from, speed, tilt);
    if (!plan.seconds) {
      st.angle = plan.target;
      paint(false);
      return;
    }
    const start = performance.now();
    const frame = (t: number) => {
      const elapsed = t - start;
      st.angle = settleAt(from, plan.target, plan.seconds, elapsed);
      paint(false);
      st.raf = elapsed < plan.seconds * 1000 ? requestAnimationFrame(frame) : 0;
    };
    st.raf = requestAnimationFrame(frame);
  };

  return (
    <div
      ref={box}
      className="group cursor-grab touch-manipulation select-none rounded-card p-2 active:cursor-grabbing [-webkit-touch-callout:none]"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const st = s.current;
        st.captured = false;
        st.moved = st.raf !== 0; // pressing a spinning stamp stops it; that press must not open the trip
        st.id = e.pointerId;
        st.x0 = e.clientX;
        st.y0 = e.clientY;
        const c = centre();
        st.pa = pointerAngle(c.cx, c.cy, e.clientX, e.clientY);
        st.samples = [{ t: e.timeStamp, angle: st.angle }];
        if (e.pointerType === "touch") {
          clearTimeout(st.hold);
          st.hold = window.setTimeout(grab, HOLD_MS);
        } else grab();
      }}
      onPointerMove={(e) => {
        const st = s.current;
        if (e.pointerId !== st.id) return;
        const c = centre();
        const pa = pointerAngle(c.cx, c.cy, e.clientX, e.clientY);
        if (!st.grabbed) {
          st.pa = pa;
          if (Math.hypot(e.clientX - st.x0, e.clientY - st.y0) > HOLD_SLOP) clearTimeout(st.hold); // a swipe: leave it to the page
          return;
        }
        // turn by how far the pointer has gone round the stamp's centre: clockwise in, clockwise out
        st.angle += angleDelta(st.pa, pa) * radiusWeight(Math.hypot(e.clientX - c.cx, e.clientY - c.cy), c.size);
        st.pa = pa;
        if (!st.captured && Math.hypot(e.clientX - st.x0, e.clientY - st.y0) > TAP_SLOP) {
          st.moved = true;
          st.captured = true;
          capture(e.pointerId);
        }
        st.samples.push({ t: e.timeStamp, angle: st.angle });
        if (st.samples.length > 12) st.samples.shift();
        paint(true);
      }}
      onPointerUp={(e) => {
        if (e.pointerId === s.current.id) release(e.timeStamp);
      }}
      onPointerCancel={() => {
        clearTimeout(s.current.hold);
        s.current.samples = [];
        release(performance.now());
      }}
      onDragStart={(e) => e.preventDefault()}
    >
      <div ref={spinner} className="will-change-transform" style={{ transform: `rotate(${tilt}deg)` }}>
        <Link
          href={href}
          draggable={false}
          title={title}
          aria-label={label}
          onClick={(e) => {
            // a drag or a spin is not a click
            if (s.current.moved) {
              e.preventDefault();
              s.current.moved = false;
            }
          }}
          className="block rounded-full outline-offset-4 outline-accent focus-visible:outline-2"
        >
          {children}
        </Link>
      </div>
    </div>
  );
}
