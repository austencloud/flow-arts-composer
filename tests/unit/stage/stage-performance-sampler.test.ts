import { describe, expect, it } from "vitest";

import { sampleSequencePlayback } from "#lib/features/stage/domain/stage-performance-sampler.js";
import {
  samplePerformerPerformance,
  type LegacyPerformer,
  type Mark,
} from "#lib/features/stage/domain/formation-migration.js";
import type { StageChoreography } from "#lib/features/stage/domain/stage-types.js";

const CHOREOGRAPHY = {
  bpm: 120,
  stageWidth: 10,
  stageDepth: 8,
} satisfies Pick<StageChoreography, "bpm" | "stageWidth" | "stageDepth">;

function mark(
  id: string,
  x: number,
  z: number,
  beats: number,
  overrides: Partial<Mark> = {}
): Mark {
  return {
    id,
    x,
    z,
    beats,
    walkStyle: "direct",
    easing: "linear",
    ...overrides,
  };
}

function performer(marks: Mark[]): LegacyPerformer {
  return {
    id: "performer-a",
    marks,
  };
}

describe("stage performance sampler", () => {
  it("maps editor coordinates into the centered 3D stage and faces direct travel", () => {
    const frame = samplePerformerPerformance(
      performer([mark("start", 5, 4, 0), mark("finish", 7, 2, 4)]),
      CHOREOGRAPHY,
      2
    );

    expect(frame.stagePosition).toEqual({ x: 6, z: 3 });
    expect(frame.worldPosition).toEqual({ x: 1, z: 1 });
    expect(frame.bodyFacing).toBeCloseTo(Math.PI / 4);
    expect(frame.travelDirection.x).toBeCloseTo(Math.SQRT1_2);
    expect(frame.travelDirection.z).toBeCloseTo(Math.SQRT1_2);
    expect(frame.moveDirection.x).toBeCloseTo(0);
    expect(frame.moveDirection.z).toBeCloseTo(1);
    expect(frame.speedMetersPerSecond).toBeCloseTo(Math.SQRT2);
    expect(frame.isMoving).toBe(true);
    expect(frame.activeMarkIndex).toBe(1);
    expect(frame.transitionProgress).toBe(0.5);
  });

  it("preserves authored facing and produces lateral locomotion for crab travel", () => {
    const frame = samplePerformerPerformance(
      performer([
        mark("start", 5, 4, 0, { facingAngle: 0 }),
        mark("finish", 7, 4, 4, { walkStyle: "crab" }),
      ]),
      CHOREOGRAPHY,
      2
    );

    expect(frame.bodyFacing).toBe(0);
    expect(frame.travelDirection).toEqual({ x: 1, z: 0 });
    expect(frame.moveDirection.x).toBeCloseTo(1);
    expect(frame.moveDirection.z).toBeCloseTo(0);
  });

  it("uses the easing derivative for instantaneous locomotion speed", () => {
    const frame = samplePerformerPerformance(
      performer([
        mark("start", 5, 4, 0),
        mark("finish", 9, 4, 4, { easing: "easeIn" }),
      ]),
      CHOREOGRAPHY,
      1
    );

    expect(frame.stagePosition.x).toBeCloseTo(5.25);
    expect(frame.transitionProgress).toBeCloseTo(0.0625);
    expect(frame.speedMetersPerSecond).toBeCloseTo(1);
  });

  it("settles on the final mark instead of walking in place after the path", () => {
    const frame = samplePerformerPerformance(
      performer([mark("start", 5, 4, 0), mark("finish", 7, 2, 4)]),
      CHOREOGRAPHY,
      8
    );

    expect(frame.stagePosition).toEqual({ x: 7, z: 2 });
    expect(frame.worldPosition).toEqual({ x: 2, z: 2 });
    expect(frame.speedMetersPerSecond).toBe(0);
    expect(frame.isMoving).toBe(false);
  });

  it("is deterministic for scrubbing and supplies a centered empty-stage frame", () => {
    const authoredPerformer = performer([
      mark("start", 2, 7, 0),
      mark("finish", 8, 1, 8, { easing: "easeInOut" }),
    ]);

    expect(
      samplePerformerPerformance(authoredPerformer, CHOREOGRAPHY, 3.25)
    ).toEqual(
      samplePerformerPerformance(authoredPerformer, CHOREOGRAPHY, 3.25)
    );

    const empty = samplePerformerPerformance(performer([]), CHOREOGRAPHY, 3);
    expect(empty.stagePosition).toEqual({ x: 5, z: 4 });
    expect(empty.worldPosition).toEqual({ x: 0, z: 0 });
    expect(empty.isMoving).toBe(false);
  });
});

describe("stage sequence playback sampling", () => {
  it("maps choreography beats onto start-pose-prefixed avatar steps", () => {
    expect(sampleSequencePlayback(0, 4, true)).toEqual({
      stepIndex: 0,
      progress: 0,
    });
    expect(sampleSequencePlayback(0.5, 4, true)).toEqual({
      stepIndex: 1,
      progress: 0.5,
    });
    expect(sampleSequencePlayback(3.75, 4, true)).toEqual({
      stepIndex: 4,
      progress: 0.75,
    });
  });

  it("wraps circular sequences and lands non-circular sequences on their end pose", () => {
    expect(sampleSequencePlayback(4, 4, true)).toEqual({
      stepIndex: 0,
      progress: 0,
    });
    expect(sampleSequencePlayback(4, 4, false)).toEqual({
      stepIndex: 4,
      progress: 1,
    });
  });
});
