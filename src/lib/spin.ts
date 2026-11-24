/** Physics for a spinnable stamp (fridge-magnet feel). Pure, no DOM: angles in degrees (clockwise is positive), time in ms, speed in degrees per second. */

/** Fastest a flick can spin the stamp: about 9 turns a second. */
export const MAX_SPEED = 3200;
/** A free spin would slow as exp(-FRICTION * seconds); the settle plan uses it to guess where a flick would have stopped. */
export const FRICTION = 1.7;
/** A release this long after the last move is a hold, not a flick. */
export const STALE_MS = 80;
/** Look back this far when measuring flick speed. */
export const WINDOW_MS = 100;
/** Slower than this on release and the stamp just eases to the nearest upright, whichever way that is. */
export const MIN_FLING = 300;
/** A fling always travels at least this far before it settles, so it never stops short or reverses. */
export const MIN_TRAVEL = 30;
/** Settle time limits in seconds. */
export const MIN_SETTLE = 0.45;
export const MAX_SETTLE = 3;

export type Sample = { t: number; angle: number };

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/** Angle of a point around a centre, clockwise from the right (screen y points down), in degrees. */
export const pointerAngle = (cx: number, cy: number, x: number, y: number): number => (Math.atan2(y - cy, x - cx) * 180) / Math.PI;

/** Shortest signed turn from one pointer angle to the next, in (-180, 180]; handles the jump across 180 / -180. */
export function angleDelta(prev: number, next: number): number {
  let d = (next - prev) % 360;
  if (d > 180) d -= 360;
  else if (d <= -180) d += 360;
  return d;
}

/** Near the centre a pointer angle is jumpy, so its turning counts less: full weight beyond `size` / 5 from the middle, none at it. */
export const radiusWeight = (r: number, size: number): number => clamp(r / (size / 5), 0, 1);

/** Speed at the moment of release from the recent angle samples (oldest first). 0 for a hold or a single sample. */
export function releaseSpeed(samples: Sample[], now: number): number {
  const last = samples.at(-1);
  if (!last || now - last.t > STALE_MS) return 0;
  const recent = samples.filter((s) => last.t - s.t <= WINDOW_MS);
  const first = recent[0];
  const span = last.t - first.t;
  if (span <= 0) return 0;
  return clamp(((last.angle - first.angle) / span) * 1000, -MAX_SPEED, MAX_SPEED);
}

/** The upright angles are `rest` plus whole turns. Nearest one to `angle`. */
export const nearestUpright = (angle: number, rest: number): number => rest + Math.round((angle - rest) / 360) * 360;

/**
 * Where a release ends up. The stamp always stops upright (at `rest` plus whole turns): a flick goes on turning the way it was
 * going and stops at the upright closest to where friction alone would have left it, so a harder flick means more turns.
 * A slow release just eases to the nearest upright.
 */
export function settlePlan(angle: number, speed: number, rest: number): { target: number; seconds: number } {
  if (Math.abs(speed) < MIN_FLING) {
    const target = nearestUpright(angle, rest);
    return { target, seconds: MIN_SETTLE };
  }
  const dir = Math.sign(speed);
  let target = nearestUpright(angle + speed / FRICTION, rest);
  while ((target - angle) * dir < MIN_TRAVEL) target += dir * 360;
  const distance = Math.abs(target - angle);
  // ease-out cubic starts at 3 * distance / seconds, so this matches the release speed
  return { target, seconds: clamp((3 * distance) / Math.abs(speed), MIN_SETTLE, MAX_SETTLE) };
}

/** Angle part-way through a settle: fast at first, slowing smoothly to exactly the target. */
export function settleAt(from: number, to: number, seconds: number, elapsedMs: number): number {
  const u = clamp(elapsedMs / 1000 / seconds, 0, 1);
  return from + (to - from) * (1 - (1 - u) ** 3);
}
