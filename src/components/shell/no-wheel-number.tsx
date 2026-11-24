"use client";

import { useEffect } from "react";

/**
 * Scrolling over a focused number input would otherwise nudge its value up or down.
 * Drop focus from it on wheel so the page scrolls and the number stays as typed. Mounted once in the root layout.
 */
export function NoWheelNumber() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement && el.type === "number" && e.target === el) el.blur();
    };
    document.addEventListener("wheel", onWheel, { passive: true });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);
  return null;
}
