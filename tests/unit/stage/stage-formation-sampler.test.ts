import { describe, expect, it } from "vitest";

import {
  sampleFormationPerformance,
  sampleStageFormations,
} from "#lib/features/stage/domain/stage-formation-sampler.js";
import type {
  Formation,
  FormationSpot,
  Performer,
  StageChoreography,
} from "#lib/features/stage/domain/stage-types.js";
import { SceneEnvironmentId } from "#lib/shared/3d/environments/domain/scene-environment.js";

function spot(
  x: number,
  z: number,
  overrides: Partial<FormationSpot> = {}
): FormationSpot {
  return { x, z, walkStyle: "direct", easing: "linear", ...overrides };
}

function performer(id: string): Performer {
  return {
    id,
    index: 0,
    label: id,
    color: "#fff",
    sequenceClips: [],
  };
}

function choreography(
  formations: Formation[],
  performers: Performer[] = [performer("a")]
): StageChoreography {
  return {
    id: "choreography",
    name: "Test",
    bpm: 120,
    stageWidth: 10,
    stageDepth: 8,
    environmentId: SceneEnvironmentId.BLOSSOM,
    performers,
    formations,
    sharedSequenceId: null,
  };
}

describe("stage formation sampler", () => {
  it("holds until the arrive-by walk begins, then walks into the next set", () => {
    const value = choreography([
      {
        id: "opening",
        atBeat: 0,
        transitionBeats: 0,
        spots: { a: spot(2, 4) },
      },
      { id: "next", atBeat: 8, transitionBeats: 4, spots: { a: spot(6, 4) } },
    ]);

    expect(sampleFormationPerformance(value, "a", 3.99).isMoving).toBe(false);
    const walkStart = sampleFormationPerformance(value, "a", 4);
    expect(walkStart.stagePosition).toEqual({ x: 2, z: 4 });
    expect(walkStart.activeMarkIndex).toBe(1);
    expect(walkStart.transitionProgress).toBe(0);
    expect(sampleFormationPerformance(value, "a", 6).stagePosition).toEqual({
      x: 4,
      z: 4,
    });
    expect(sampleFormationPerformance(value, "a", 8).isMoving).toBe(false);
  });

  it("applies easing to progress and its derivative to midpoint speed", () => {
    const value = choreography([
      {
        id: "opening",
        atBeat: 0,
        transitionBeats: 0,
        spots: { a: spot(2, 4) },
      },
      {
        id: "next",
        atBeat: 8,
        transitionBeats: 4,
        spots: { a: spot(6, 4, { easing: "easeIn" }) },
      },
    ]);

    const frame = sampleFormationPerformance(value, "a", 6);
    expect(frame.transitionProgress).toBe(0.25);
    expect(frame.stagePosition.x).toBe(3);
    expect(frame.speedMetersPerSecond).toBeCloseTo(2);
  });

  it("keeps previous facing for crab travel and faces travel for direct travel", () => {
    const crab = choreography([
      {
        id: "opening",
        atBeat: 0,
        transitionBeats: 0,
        spots: { a: spot(2, 4, { facingAngle: 0 }) },
      },
      {
        id: "next",
        atBeat: 8,
        transitionBeats: 4,
        spots: { a: spot(6, 4, { walkStyle: "crab" }) },
      },
    ]);
    const direct = choreography([
      {
        id: "opening",
        atBeat: 0,
        transitionBeats: 0,
        spots: { a: spot(2, 4) },
      },
      { id: "next", atBeat: 8, transitionBeats: 4, spots: { a: spot(6, 4) } },
    ]);

    expect(sampleFormationPerformance(crab, "a", 6).bodyFacing).toBe(0);
    expect(sampleFormationPerformance(direct, "a", 6).bodyFacing).toBeCloseTo(
      Math.PI / 2
    );
  });

  it("lets an authored facing angle override either walk style", () => {
    const value = choreography([
      {
        id: "opening",
        atBeat: 0,
        transitionBeats: 0,
        spots: { a: spot(2, 4) },
      },
      {
        id: "next",
        atBeat: 8,
        transitionBeats: 4,
        spots: { a: spot(6, 4, { facingAngle: -0.75 }) },
      },
    ]);

    expect(sampleFormationPerformance(value, "a", 6).bodyFacing).toBe(-0.75);
  });

  it("clamps before the opening and after the final arrival", () => {
    const value = choreography([
      {
        id: "opening",
        atBeat: 0,
        transitionBeats: 0,
        spots: { a: spot(2, 6) },
      },
      { id: "next", atBeat: 8, transitionBeats: 4, spots: { a: spot(6, 2) } },
    ]);

    expect(sampleFormationPerformance(value, "a", -2).stagePosition).toEqual({
      x: 2,
      z: 6,
    });
    const final = sampleFormationPerformance(value, "a", 20);
    expect(final.stagePosition).toEqual({ x: 6, z: 2 });
    expect(final.bodyFacing).toBeCloseTo(Math.PI / 4);
    expect(final.isMoving).toBe(false);
  });

  it("returns a centered stationary frame when no formations exist", () => {
    const frame = sampleFormationPerformance(choreography([]), "a", 12);
    expect(frame.stagePosition).toEqual({ x: 5, z: 4 });
    expect(frame.worldPosition).toEqual({ x: 0, z: 0 });
    expect(frame.isMoving).toBe(false);
  });

  it("holds a performer's nearest previous spot when a formation is incomplete", () => {
    const value = choreography([
      {
        id: "opening",
        atBeat: 0,
        transitionBeats: 0,
        spots: { a: spot(2, 4) },
      },
      { id: "next", atBeat: 8, transitionBeats: 4, spots: {} },
    ]);

    expect(sampleFormationPerformance(value, "a", 6).stagePosition).toEqual({
      x: 2,
      z: 4,
    });
  });

  it("samples the canonical triangle to reverse-triangle arrive-by move", () => {
    const cast = [performer("a"), performer("b"), performer("c")];
    const value = choreography(
      [
        {
          id: "triangle",
          atBeat: 0,
          transitionBeats: 0,
          spots: { a: spot(5, 2), b: spot(3, 6), c: spot(7, 6) },
        },
        {
          id: "reverse-triangle",
          atBeat: 64,
          transitionBeats: 16,
          spots: { a: spot(5, 6), b: spot(3, 2), c: spot(7, 2) },
        },
      ],
      cast
    );

    expect(
      sampleStageFormations(value, 40).every((frame) => !frame.isMoving)
    ).toBe(true);
    expect(
      sampleStageFormations(value, 56).every((frame) => frame.isMoving)
    ).toBe(true);
    const arrived = sampleStageFormations(value, 64);
    expect(arrived.map((frame) => frame.stagePosition)).toEqual([
      { x: 5, z: 6 },
      { x: 3, z: 2 },
      { x: 7, z: 2 },
    ]);
    expect(arrived.every((frame) => !frame.isMoving)).toBe(true);
  });
});
