import { describe, expect, it } from "vitest";
import { MAX_SPEED, MAX_SETTLE, MIN_FLING, MIN_SETTLE, MIN_TRAVEL, STALE_MS, angleDelta, nearestUpright, pointerAngle, radiusWeight, releaseSpeed, settleAt, settlePlan } from "@/lib/spin";

describe("pointerAngle / angleDelta", () => {
  it("moving clockwise around the centre gives a positive turn (screen y points down)", () => {
    const right = pointerAngle(0, 0, 10, 0); // 3 o'clock
    const below = pointerAngle(0, 0, 0, 10); // 6 o'clock
    const left = pointerAngle(0, 0, -10, 0); // 9 o'clock
    expect(angleDelta(right, below)).toBeCloseTo(90);
    expect(angleDelta(below, left)).toBeCloseTo(90);
    expect(angleDelta(below, right)).toBeCloseTo(-90); // back the other way
  });
  it("dragging down on the right side is clockwise, down on the left side is counter-clockwise", () => {
    expect(angleDelta(pointerAngle(0, 0, 10, -2), pointerAngle(0, 0, 10, 2))).toBeGreaterThan(0);
    expect(angleDelta(pointerAngle(0, 0, -10, -2), pointerAngle(0, 0, -10, 2))).toBeLessThan(0);
  });
  it("takes the short way across the 180 degree seam", () => {
    expect(angleDelta(170, -170)).toBeCloseTo(20);
    expect(angleDelta(-170, 170)).toBeCloseTo(-20);
    expect(angleDelta(10, 10)).toBe(0);
  });
});

describe("radiusWeight", () => {
  it("counts less near the centre and fully further out", () => {
    expect(radiusWeight(0, 100)).toBe(0);
    expect(radiusWeight(10, 100)).toBeCloseTo(0.5);
    expect(radiusWeight(40, 100)).toBe(1);
  });
});

describe("releaseSpeed", () => {
  it("measures degrees per second over the recent samples", () => {
    expect(releaseSpeed([{ t: 0, angle: 0 }, { t: 50, angle: 70 }], 60)).toBeCloseTo(1400);
  });
  it("a hold, or one sample, has no speed", () => {
    expect(releaseSpeed([{ t: 0, angle: 0 }, { t: 50, angle: 70 }], 50 + STALE_MS + 1)).toBe(0);
    expect(releaseSpeed([{ t: 0, angle: 0 }], 10)).toBe(0);
    expect(releaseSpeed([], 10)).toBe(0);
  });
  it("caps a wild flick in either direction", () => {
    expect(releaseSpeed([{ t: 0, angle: 0 }, { t: 20, angle: 1000 }], 25)).toBe(MAX_SPEED);
    expect(releaseSpeed([{ t: 0, angle: 0 }, { t: 20, angle: -900 }], 25)).toBe(-MAX_SPEED);
  });
});

describe("settlePlan: always ends upright", () => {
  const REST = 3; // the stamp's own resting tilt
  const upright = (a: number) => Math.abs(((a - REST) % 360) + 360) % 360;
  const isUpright = (a: number) => upright(a) < 1e-6 || Math.abs(upright(a) - 360) < 1e-6;

  it("nearestUpright picks the closest whole turn from the rest angle", () => {
    expect(nearestUpright(100, 3)).toBe(3);
    expect(nearestUpright(200, 3)).toBe(363);
    expect(nearestUpright(-200, 3)).toBe(-357);
  });
  it("a slow release eases to the nearest upright, either way", () => {
    const a = settlePlan(150, 10, REST);
    expect(a.target).toBe(3);
    expect(a.seconds).toBe(MIN_SETTLE);
    expect(settlePlan(250, 0, REST).target).toBe(363);
  });
  for (const speed of [MIN_FLING, 500, 900, 1500, 2400, MAX_SPEED, -MIN_FLING, -700, -2000, -MAX_SPEED]) {
    for (const angle of [3, 47, 200, -130, 710]) {
      it(`flick at ${speed} from ${angle} lands upright, going the same way`, () => {
        const p = settlePlan(angle, speed, REST);
        expect(isUpright(p.target)).toBe(true);
        expect((p.target - angle) * Math.sign(speed)).toBeGreaterThanOrEqual(MIN_TRAVEL);
        expect(p.seconds).toBeGreaterThanOrEqual(MIN_SETTLE);
        expect(p.seconds).toBeLessThanOrEqual(MAX_SETTLE);
      });
    }
  }
  it("a harder flick turns further", () => {
    const soft = Math.abs(settlePlan(3, 600, REST).target - 3);
    const hard = Math.abs(settlePlan(3, 2800, REST).target - 3);
    expect(hard).toBeGreaterThan(soft * 3);
  });
});

describe("settleAt", () => {
  it("starts at the start, ends exactly on the target, never overshoots", () => {
    expect(settleAt(0, 720, 2, 0)).toBe(0);
    expect(settleAt(0, 720, 2, 2000)).toBe(720);
    expect(settleAt(0, 720, 2, 9999)).toBe(720);
    let last = 0;
    for (let t = 0; t <= 2000; t += 16) {
      const a = settleAt(0, 720, 2, t);
      expect(a).toBeGreaterThanOrEqual(last);
      expect(a).toBeLessThanOrEqual(720);
      last = a;
    }
  });
  it("works for counter-clockwise turns", () => {
    expect(settleAt(0, -360, 1, 1000)).toBe(-360);
    expect(settleAt(0, -360, 1, 100)).toBeLessThan(0);
  });
});
