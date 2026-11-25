"use client";

import type { ReactNode } from "react";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { TRANSITION_BASE } from "@/lib/motion";

/**
 * App-wide Motion setup.
 * - LazyMotion + `m.*` components; `strict` throws if a full `motion.*` component is used anywhere.
 * - Features (domMax: drag, layout, layoutId) load synchronously on purpose. The async form
 *   (`features={() => import(...)}`) updates context during hydration, which makes React client-render
 *   streamed Suspense boundaries and leaves their hidden server copies in the DOM.
 * - reducedMotion="user" drops transform and layout animation when the OS asks for reduced motion;
 *   opacity fades still run.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user" transition={TRANSITION_BASE}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
