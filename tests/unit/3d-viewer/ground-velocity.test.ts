import { describe, expect, it } from "vitest";
import {
  advanceGroundVelocity,
  DEFAULT_AIR_CONTROL_FRACTION,
  type GroundVelocity,
} from "@austencloud/camera-3d";
import {
  FLOW_FEST_GAMEPLAY_GROUND_ACCELERATION_METERS_PER_SECOND_SQUARED as ACCELERATION,
  FLOW_FEST_GAMEPLAY_GROUND_DECELERATION_METERS_PER_SECOND_SQUARED as DECELERATION,
  FLOW_FEST_GAMEPLAY_SPRINT_MULTIPLIER,
  FLOW_FEST_GAMEPLAY_WALK_SPEED_METERS_PER_SECOND as WALK_SPEED,
} from "#lib/features/flow-fest-sim/domain/flow-fest-simulation-contract.js";

const RUN_SPEED = WALK_SPEED * FLOW_FEST_GAMEPLAY_SPRINT_MULTIPLIER;
const FRAME = 1 / 60;

/** Measured native ground speeds of the shipped walk and run clips. */
const WALK_CLIP_NATIVE_SPEED = 1.517;
const RUN_CLIP_NATIVE_SPEED = 3.099;
/** The animator's tier band: walk stride ceiling to run stride floor. */
const TIER_BAND_LOWER = WALK_CLIP_NATIVE_SPEED * 1.15;
const TIER_BAND_UPPER = RUN_CLIP_NATIVE_SPEED * 0.8;

interface RunOptions {
  targetX?: number;
  targetZ: number;
  maximumSpeed: number;
  acceleration?: number;
  deceleration?: number;
  grounded?: boolean;
  frames: number;
  from?: GroundVelocity;
}

/** Step the model and return every intermediate velocity. */
function simulate(options: RunOptions): GroundVelocity[] {
  let current: GroundVelocity = options.from ?? { x: 0, z: 0 };
  const trace: GroundVelocity[] = [];
  for (let frame = 0; frame < options.frames; frame += 1) {
    current = advanceGroundVelocity({
      current,
      targetX: options.targetX ?? 0,
      targetZ: options.targetZ,
      maximumSpeed: options.maximumSpeed,
      acceleration: options.acceleration ?? ACCELERATION,
      deceleration: options.deceleration ?? DECELERATION,
      grounded: options.grounded ?? true,
      deltaSeconds: FRAME,
    });
    trace.push(current);
  }
  return trace;
}

const speedOf = (v: GroundVelocity) => Math.hypot(v.x, v.z);

/** Seconds until the trace first reaches `speed`, or Infinity. */
function timeToReach(trace: GroundVelocity[], speed: number): number {
  const index = trace.findIndex((v) => speedOf(v) >= speed - 1e-9);
  return index < 0 ? Number.POSITIVE_INFINITY : (index + 1) * FRAME;
}

describe("ground velocity", () => {
  it("reproduces instant response when no acceleration is supplied", () => {
    // Every consumer that has not opted into momentum passes Infinity, and
    // must land exactly where the old assignment put it on frame one.
    const [first] = simulate({
      targetZ: WALK_SPEED,
      maximumSpeed: WALK_SPEED,
      acceleration: Number.POSITIVE_INFINITY,
      deceleration: Number.POSITIVE_INFINITY,
      frames: 1,
    });
    expect(first.z).toBeCloseTo(WALK_SPEED, 10);
  });

  it("reaches walking pace inside the responsive band", () => {
    const trace = simulate({
      targetZ: WALK_SPEED,
      maximumSpeed: WALK_SPEED,
      frames: 60,
    });
    const elapsed = timeToReach(trace, WALK_SPEED);
    // 1.7 / 8 = 0.2125 s. Above ~0.25 s the keyboard starts to feel laggy.
    expect(elapsed).toBeGreaterThan(0.15);
    expect(elapsed).toBeLessThan(0.25);
  });

  it("reaches running pace in about half a second", () => {
    const trace = simulate({
      targetZ: RUN_SPEED,
      maximumSpeed: RUN_SPEED,
      frames: 90,
    });
    const elapsed = timeToReach(trace, RUN_SPEED);
    // 3.91 / 8 = 0.489 s, which is inside a real person's range from a
    // standing start and far from the instant snap this replaced.
    expect(elapsed).toBeGreaterThan(0.4);
    expect(elapsed).toBeLessThan(0.6);
  });

  it("crosses the animator's walk-to-run tier band over several frames", () => {
    // The whole point of accelerating: the run tier blends on measured ground
    // speed, so an instant velocity crossed this band in one frame and popped
    // between clips. Held for at least three frames it is a real crossover.
    const trace = simulate({
      targetZ: RUN_SPEED,
      maximumSpeed: RUN_SPEED,
      frames: 90,
    });
    const framesInBand = trace.filter((v) => {
      const speed = speedOf(v);
      return speed > TIER_BAND_LOWER && speed < TIER_BAND_UPPER;
    }).length;
    expect(framesInBand).toBeGreaterThanOrEqual(3);
    expect(timeToReach(trace, TIER_BAND_UPPER)).toBeLessThan(
      timeToReach(trace, RUN_SPEED)
    );
  });

  it("brakes rather than coasts when sprint is released mid-stride", () => {
    // Still holding forward, so a rule that keys off "is input held" would
    // pick the acceleration rate and take half again as long to slow down.
    const [afterOneFrame] = simulate({
      targetZ: WALK_SPEED,
      maximumSpeed: WALK_SPEED,
      from: { x: 0, z: RUN_SPEED },
      frames: 1,
    });
    expect(RUN_SPEED - afterOneFrame.z).toBeCloseTo(DECELERATION * FRAME, 10);
  });

  it("stops from a run inside the distance the terminal stops absorb", () => {
    const trace = simulate({
      targetZ: 0,
      maximumSpeed: RUN_SPEED,
      from: { x: 0, z: RUN_SPEED },
      frames: 120,
    });
    const stopFrame = trace.findIndex((v) => speedOf(v) <= 1e-9);
    expect(stopFrame).toBeGreaterThanOrEqual(0);
    const distance = trace
      .slice(0, stopFrame + 1)
      .reduce((sum, v) => sum + speedOf(v) * FRAME, 0);
    // 3.91^2 / (2 * 12) = 0.637 m, about a stride and a half.
    expect(distance).toBeGreaterThan(0.5);
    expect(distance).toBeLessThan(0.8);
  });

  it("gives a fraction of the rate with no foot down", () => {
    const [grounded] = simulate({
      targetZ: RUN_SPEED,
      maximumSpeed: RUN_SPEED,
      frames: 1,
    });
    const [airborne] = simulate({
      targetZ: RUN_SPEED,
      maximumSpeed: RUN_SPEED,
      grounded: false,
      frames: 1,
    });
    expect(airborne.z).toBeCloseTo(
      grounded.z * DEFAULT_AIR_CONTROL_FRACTION,
      10
    );
  });

  it("clamps diagonal input to the commanded speed", () => {
    const trace = simulate({
      targetX: WALK_SPEED,
      targetZ: WALK_SPEED,
      maximumSpeed: WALK_SPEED,
      frames: 120,
    });
    for (const velocity of trace) {
      expect(speedOf(velocity)).toBeLessThanOrEqual(WALK_SPEED + 1e-9);
    }
    expect(speedOf(trace[trace.length - 1])).toBeCloseTo(WALK_SPEED, 8);
  });

  it("carries a reversal through zero instead of teleporting", () => {
    // The bound is on the velocity vector, so a hard about-face has to spend
    // real time slowing down before it can build speed the other way.
    const trace = simulate({
      targetZ: -RUN_SPEED,
      maximumSpeed: RUN_SPEED,
      from: { x: 0, z: RUN_SPEED },
      frames: 120,
    });
    expect(trace.some((v) => Math.abs(v.z) < 0.25)).toBe(true);
    const firstNegative = trace.findIndex((v) => v.z < 0);
    expect(firstNegative).toBeGreaterThan(3);
    expect(trace[trace.length - 1].z).toBeCloseTo(-RUN_SPEED, 6);
  });

  it("never overshoots the target it is chasing", () => {
    const trace = simulate({
      targetZ: WALK_SPEED,
      maximumSpeed: WALK_SPEED,
      frames: 120,
    });
    for (const velocity of trace) {
      expect(velocity.z).toBeLessThanOrEqual(WALK_SPEED + 1e-9);
    }
  });
});
