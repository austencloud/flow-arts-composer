/**
 * Groundwork step 1 in docs/architecture/performer-grid-styles.md: each
 * performer places its hands by its own hand distance, per hand and per
 * direction, and the default keeps today's 0.52 m everywhere.
 */

import { describe, expect, it } from "vitest";
import { Plane, PlaneMode, type PropState3D } from "@austencloud/scene-3d";
import {
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { MotionConfig3D } from "#lib/shared/3d/domain/models/motion-data-3d.js";
import { GRID_RADIUS_3D } from "#lib/shared/3d/domain/constants/plane-transforms.js";
import {
  fixedHandDistance,
  largestHandDistance,
  type HandDistance,
} from "#lib/shared/3d/domain/performer-hand-distance.js";
import { calculatePropState } from "#lib/shared/3d/services/prop-state-interpolator.js";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
  type CharacterInstanceState,
} from "#lib/shared/3d/state/character-instance-state.svelte.js";
import { propContinuityCorpus } from "../../tools/prop-continuity-corpus";

function wallMotion(
  motionType: MotionType,
  start: string,
  end: string,
  pathShape?: MotionConfig3D["pathShape"]
): MotionConfig3D {
  return {
    plane: Plane.WALL,
    startLocation: start as GridLocation,
    endLocation: end as GridLocation,
    motionType,
    rotationDirection: RotationDirection.CLOCKWISE,
    turns: 0,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    pathShape,
  };
}

/** Farther out to the east than to the north, like a hand reaching to its own side. */
const lopsided: HandDistance = {
  toward: (_plane, angle) => 0.4 + 0.1 * Math.cos(angle),
  max: 0.5,
};

function performerFor(id: string): CharacterInstanceState {
  const entry = propContinuityCorpus().find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`no corpus entry ${id}`);
  const performer = createCharacterInstanceState(
    { id: `hand-distance-${id}`, positionX: 0, persistent: false },
    makeStandaloneDeps()
  );
  performer.setPlaneMode(PlaneMode.WALL);
  performer.loadSequence(entry.sequence);
  return performer;
}

function expectScaled(
  actual: PropState3D | null,
  reference: PropState3D | null,
  scale: number
) {
  expect(actual).not.toBeNull();
  expect(reference).not.toBeNull();
  const expected = reference!.worldPosition.clone().multiplyScalar(scale);
  expect(actual!.worldPosition.x).toBeCloseTo(expected.x, 12);
  expect(actual!.worldPosition.y).toBeCloseTo(expected.y, 12);
  expect(actual!.worldPosition.z).toBeCloseTo(expected.z, 12);
  expect(actual!.worldRotation.equals(reference!.worldRotation)).toBe(true);
}

describe("hand placement by hand distance", () => {
  it("keeps today's 0.52 m when no distance is given", () => {
    const fixed = fixedHandDistance(GRID_RADIUS_3D);
    for (const config of [
      wallMotion(MotionType.PRO, "n", "e", "arc"),
      wallMotion(MotionType.DASH, "n", "s"),
    ]) {
      for (const progress of [0, 0.3, 0.5, 1]) {
        const plain = calculatePropState(config, progress);
        const given = calculatePropState(config, progress, fixed);
        expect(plain.worldPosition.toArray()).toEqual(
          given.worldPosition.toArray()
        );
        expect(plain.centerPathAngle).toBe(given.centerPathAngle);
      }
    }
    const arc = calculatePropState(
      wallMotion(MotionType.PRO, "n", "e", "arc"),
      0.3
    );
    expect(arc.worldPosition.length()).toBeCloseTo(GRID_RADIUS_3D, 12);
    expect(largestHandDistance()).toBe(GRID_RADIUS_3D);
  });

  it("holds an arc at the distance for each direction it passes", () => {
    const pro = wallMotion(MotionType.PRO, "n", "e", "arc");
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const state = calculatePropState(pro, progress, lopsided);
      expect(state.worldPosition.length()).toBeCloseTo(
        lopsided.toward(Plane.WALL, state.centerPathAngle),
        12
      );
    }
    const north = calculatePropState(pro, 0, lopsided).worldPosition;
    const east = calculatePropState(pro, 1, lopsided).worldPosition;
    expect(north.y).toBeCloseTo(0.4, 12);
    expect(east.x).toBeCloseTo(-0.5, 12);
  });

  it("runs a dash through the center to the far side's own distance", () => {
    const shortNorth: HandDistance = {
      toward: (_plane, angle) => (Math.sin(angle) < 0 ? 0.4 : 0.6),
      max: 0.6,
    };
    const dash = wallMotion(MotionType.DASH, "n", "s");
    expect(calculatePropState(dash, 0, shortNorth).worldPosition.y).toBeCloseTo(
      0.4,
      12
    );
    expect(
      calculatePropState(dash, 0.5, shortNorth).worldPosition.length()
    ).toBeCloseTo(0, 12);
    expect(calculatePropState(dash, 1, shortNorth).worldPosition.y).toBeCloseTo(
      -0.6,
      12
    );
  });

  it("reports the farther hand for framing", () => {
    expect(
      largestHandDistance({
        left: fixedHandDistance(0.3),
        right: lopsided,
      })
    ).toBe(0.5);
  });
});

describe("performer hand distance", () => {
  const LEFT_M = 0.3;
  const RIGHT_M = 0.7;

  it("starts every performer at today's distance", () => {
    const performer = performerFor("tnd-tog-opp-ekek");
    expect(largestHandDistance(performer.handDistance)).toBe(GRID_RADIUS_3D);
    expect(performer.handDistance.left.toward(Plane.WALL, 1)).toBe(
      GRID_RADIUS_3D
    );
    expect(performer.handDistance.right.toward(Plane.WALL, 1)).toBe(
      GRID_RADIUS_3D
    );
  });

  it("places each hand at its own distance across the score", () => {
    const performer = performerFor("tnd-tog-opp-ekek");
    const scoreTimes = [0, 0.25, 0.5, 1.75, 2.5, 3.9];
    const before = scoreTimes.map((t) => performer.propStatesAtScoreTime(t));

    performer.setHandDistance({
      left: fixedHandDistance(LEFT_M),
      right: fixedHandDistance(RIGHT_M),
    });

    scoreTimes.forEach((t, index) => {
      const after = performer.propStatesAtScoreTime(t);
      expectScaled(after.left, before[index]!.left, LEFT_M / GRID_RADIUS_3D);
      expectScaled(after.right, before[index]!.right, RIGHT_M / GRID_RADIUS_3D);
    });
  });

  it("moves the drawn props when the distance changes", () => {
    const performer = performerFor("tnd-tog-opp-ekek");
    performer.goToStep(1 + performer.motionStepOffset);
    performer.setProgress(0.4);
    const left = performer.leftPropState;
    const right = performer.rightPropState;

    performer.setHandDistance({
      left: fixedHandDistance(LEFT_M),
      right: fixedHandDistance(RIGHT_M),
    });

    expectScaled(performer.leftPropState, left, LEFT_M / GRID_RADIUS_3D);
    expectScaled(performer.rightPropState, right, RIGHT_M / GRID_RADIUS_3D);
  });
});
