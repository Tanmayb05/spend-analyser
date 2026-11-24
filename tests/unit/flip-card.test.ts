import { describe, expect, it } from "vitest";
import { DEG_PER_PX, FLICK, MOUSE_TILT, TOUCH_TILT, dragTurn, flipped, isBackUp, leanFor, settleAngle } from "@/lib/flip-card";

describe("flip card sides", () => {
  it("knows which side is up from the resting angle", () => {
    expect([0, 180, 360, -180, -360].map(isBackUp)).toEqual([false, true, false, true, false]);
  });
  it("flips to the other side and returns", () => {
    expect(flipped(0)).toBe(180);
    expect(flipped(180)).toBe(0);
    expect(flipped(flipped(0))).toBe(0);
    // turning back from a negative angle keeps spinning the same way, and lands on the front again
    expect(flipped(-180)).toBe(-360);
    expect(isBackUp(flipped(-180))).toBe(false);
  });
});

describe("dragTurn", () => {
  it("follows the pointer at the set rate in both directions", () => {
    expect(dragTurn(100)).toBeCloseTo(100 * DEG_PER_PX);
    expect(dragTurn(-100)).toBeCloseTo(-100 * DEG_PER_PX);
  });
  it("never turns more than half a turn", () => {
    expect(dragTurn(10_000)).toBe(180);
    expect(dragTurn(-10_000)).toBe(-180);
  });
});

describe("settleAngle", () => {
  it("settles on the nearer side after a long drag", () => {
    expect(settleAngle(0, 100)).toBe(180);
    expect(settleAngle(0, -100)).toBe(-180);
    expect(settleAngle(180, -100)).toBe(0);
    expect(settleAngle(180, 100)).toBe(360);
  });
  it("completes the turn after a short drag past the flick, in the dragged direction", () => {
    expect(settleAngle(0, FLICK + 1)).toBe(180);
    expect(settleAngle(0, -(FLICK + 1))).toBe(-180);
    expect(settleAngle(180, 60)).toBe(360);
    expect(settleAngle(180, -(FLICK + 1))).toBe(0);
  });
  it("snaps back when the drag is smaller than a flick", () => {
    expect(settleAngle(0, FLICK - 1)).toBe(0);
    expect(settleAngle(0, 0)).toBe(0);
    expect(settleAngle(180, -(FLICK - 1))).toBe(180);
  });
  it("always lands on a multiple of 180", () => {
    for (const a of [0, 180, -180, 360]) for (let t = -180; t <= 180; t += 7) expect(Math.abs(settleAngle(a, t) % 180)).toBe(0);
  });
});

describe("leanFor", () => {
  it("is flat at the centre", () => {
    expect(leanFor(0.5, 0.5, MOUSE_TILT)).toEqual({ y: 0, x: 0 });
  });
  it("pushes the touched side away: right edge leans one way, left the other", () => {
    expect(leanFor(1, 0.5, MOUSE_TILT).y).toBe(MOUSE_TILT.y);
    expect(leanFor(0, 0.5, MOUSE_TILT).y).toBe(-MOUSE_TILT.y);
  });
  it("top tilts one way on x, bottom the other", () => {
    expect(leanFor(0.5, 0, MOUSE_TILT).x).toBe(MOUSE_TILT.x);
    expect(leanFor(0.5, 1, MOUSE_TILT).x).toBe(-MOUSE_TILT.x);
  });
  it("clamps a pointer outside the card and leans less for a finger", () => {
    expect(leanFor(5, -3, MOUSE_TILT)).toEqual({ y: MOUSE_TILT.y, x: MOUSE_TILT.x });
    expect(leanFor(1, 0.5, TOUCH_TILT).y).toBeLessThan(leanFor(1, 0.5, MOUSE_TILT).y);
  });
});
