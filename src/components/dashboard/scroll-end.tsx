"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A horizontally scrolling box that starts at its right end, so the most recent part of a timeline is the part you see first. */
export function ScrollEnd({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);
  return (
    <div ref={ref} className={cn("overflow-x-auto", className)} role={label ? "group" : undefined} aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}
