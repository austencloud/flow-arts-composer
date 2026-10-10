import { describe, expect, it } from "vitest";
import {
  sampleInterruptibleHermite,
  sampleInterruptibleVector3,
  type TimedTransition,
} from "#lib/shared/3d/camera/transitions.js";

const timing: TimedTransition = {
  id: 1,
  startTimeMs: 1_000,
  durationMs: 500,
};

describe("interruptible 3D transitions", () => {
  it("arrives exactly at rest on the shared clock", () => {
    const end = sampleInterruptibleHermite(2, 10, 0, timing, 1_500);

    expect(end.value).toBe(10);
    expect(end.velocity).toBe(0);
    expect(end.progress).toBe(1);
    expect(end.done).toBe(true);
  });

  it("preserves the visible velocity when a transition is retargeted", () => {
    const first = sampleInterruptibleHermite(0, 10, 0, timing, 1_200);
    const replacement: TimedTransition = {
      id: 2,
      startTimeMs: 1_200,
      durationMs: 500,
    };
    const seam = sampleInterruptibleHermite(
      first.value,
      -4,
      first.velocity,
      replacement,
      1_200
    );

    expect(seam.value).toBeCloseTo(first.value, 10);
    expect(seam.velocity).toBeCloseTo(first.velocity, 10);
  });

  it("uses the same progress for every camera coordinate", () => {
    const sample = sampleInterruptibleVector3(
      { x: 0, y: 2, z: -4 },
      { x: 6, y: 5, z: -10 },
      { x: 0, y: 0, z: 0 },
      timing,
      1_250
    );

    expect(sample.progress).toBe(0.5);
    expect(sample.value).toEqual({ x: 3, y: 3.5, z: -7 });
  });
});
