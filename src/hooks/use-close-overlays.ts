"use client";

import { useEffect } from "react";

/** Closes open overlay info panels (<details data-overlay>) on a tap outside them or Escape. */
export function useCloseOverlays() {
  useEffect(() => {
    const close = (keep?: EventTarget | null) => {
      document.querySelectorAll<HTMLDetailsElement>("details[data-overlay][open]").forEach((d) => {
        if (!(keep instanceof Node && d.contains(keep))) d.open = false;
      });
    };
    const onDown = (e: PointerEvent) => close(e.target);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
}
