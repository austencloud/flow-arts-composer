import { describe, expect, it } from "vitest";
import {
  FIRE_PHYSICS,
  flameBurnTime,
  flamePuffShare,
  stepFlameParcelVelocity,
} from "./fire-physics";

/** Follow one parcel of gas from a wick moving along +x at `speed` (m/s). */
function followParcel(speed: number, dt: number) {
  const v = {
    vx: speed * FIRE_PHYSICS.wakeCarry,
    vy: 0,
    vz: 0,
  };
  let x = 0;
  let y = 0;
  const life = flameBurnTime(speed);
  for (let t = 0; t < life; t += dt) {
    stepFlameParcelVelocity(v, 0, 0, 0, dt);
    x += v.vx * dt;
    y += v.vy * dt;
  }
  // The wick has moved on by speed * life; the gas stays near where it left.
  return { behind: speed * life - x, rise: y };
}

describe("wick flame physics", () => {
  it("stands a still flame about 30 cm tall", () => {
    const { rise } = followParcel(0, 1 / 240);
    expect(rise).toBeGreaterThan(0.22);
    expect(rise).toBeLessThan(0.35);
  });

  it("trails a moving wick's flame a quarter of a staff circle at most", () => {
    const slow = followParcel(5, 1 / 240).behind;
    const fast = followParcel(10, 1 / 240).behind;
    expect(slow).toBeGreaterThan(0.4);
    expect(fast).toBeGreaterThan(slow);
    // A staff wick at 10 m/s circles about 0.75 m from the hand: a quarter
    // circle is about 1.2 m. The old 2D fire painted most of the circle.
    expect(fast).toBeLessThan(1.2);
  });

  it("leaves the flame in the air instead of throwing it", () => {
    const v = { vx: 10 * FIRE_PHYSICS.wakeCarry, vy: 0, vz: 0 };
    stepFlameParcelVelocity(v, 0, 0, 0, 0.1);
    // Within a tenth of a second the gas keeps under 2% of the wick's speed
    // (the old 3D fire kept 40% for half a second and flung flame a metre).
    expect(Math.abs(v.vx)).toBeLessThan(10 * 0.02);
  });

  it("moves the gas the same at any frame rate", () => {
    const at60 = followParcel(6, 1 / 60);
    const at144 = followParcel(6, 1 / 144);
    expect(at60.rise).toBeCloseTo(at144.rise, 1);
    expect(at60.behind).toBeCloseTo(at144.behind, 1);
  });

  it("puffs only while the wick is nearly still", () => {
    expect(flamePuffShare(0)).toBe(1);
    expect(flamePuffShare(FIRE_PHYSICS.puffFadeSpeed)).toBe(0);
    expect(flamePuffShare(8)).toBe(0);
  });
});
