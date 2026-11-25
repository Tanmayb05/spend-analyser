import type { Transition } from "motion/react";

/**
 * Motion timing tokens. Motion cannot read CSS custom properties for easing or duration, so these
 * mirror globals.css by hand: keep them in sync with --ease-ui and --dur-fast/base/slow.
 * Durations are in seconds (Motion's unit), not milliseconds.
 */
export const EASE_UI = [0.22, 1, 0.36, 1] as const;

export const DUR = {
  fast: 0.15,
  base: 0.2,
  slow: 0.32,
} as const;

/** Default tween for state changes (indicator slides, list enter/exit). */
export const TRANSITION_BASE: Transition = { duration: DUR.base, ease: EASE_UI };

/** Sheets, drawers and entrances. */
export const TRANSITION_SLOW: Transition = { duration: DUR.slow, ease: EASE_UI };

/** Release after a drag: a damped spring so the element settles without overshoot. */
export const SPRING_SETTLE: Transition = { type: "spring", stiffness: 500, damping: 40, mass: 1 };

/** Drag-to-dismiss thresholds shared by sheets and swipe rows (px and px/s). */
export const DISMISS = { offset: 100, velocity: 500 } as const;
