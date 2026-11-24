/** Pure maths behind the two-sided flip card (components/cards/flip-card.tsx), kept apart so it can be tested. */

export const DEG_PER_PX = 0.6;
/** px before a press counts as a drag and not a tap */
export const DRAG_START = 6;
/** degrees of turn that still completes a flip on release */
export const FLICK = 25;
/** most the card leans toward the pointer, in degrees */
export const MOUSE_TILT = { y: 20, x: 10 };
export const TOUCH_TILT = { y: 14, x: 7 };

/** True while the back face is showing; the resting angle is always a multiple of 180. */
export const isBackUp = (angle: number) => Math.abs(Math.round(angle / 180)) % 2 === 1;

/** The resting angle after a tap or the flip button: the other side. */
export const flipped = (angle: number) => angle + (isBackUp(angle) ? -180 : 180);

/** Live extra turn while dragging: follows the pointer, but never more than half a turn either way. */
export const dragTurn = (dx: number) => Math.max(-180, Math.min(180, dx * DEG_PER_PX));

/**
 * Where a drag settles on release: the nearer side, except that a flick past FLICK degrees still completes the turn
 * in the direction it was dragged, so a short drag does not snap back.
 */
export function settleAngle(angle: number, turn: number): number {
  let target = Math.round((angle + turn) / 180) * 180;
  if (target === angle && Math.abs(turn) > FLICK) target = angle + 180 * Math.sign(turn);
  return target;
}

/**
 * Lean toward the pointer from its position inside the card (fx, fy in 0..1, clamped): right of centre pushes the right
 * edge away, above centre pushes the top away.
 */
export function leanFor(fx: number, fy: number, max: { y: number; x: number }) {
  const cx = Math.min(1, Math.max(0, fx));
  const cy = Math.min(1, Math.max(0, fy));
  return { y: (cx - 0.5) * 2 * max.y, x: (0.5 - cy) * 2 * max.x };
}
