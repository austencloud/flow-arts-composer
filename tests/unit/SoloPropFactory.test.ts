/**
 * SoloPropFactory Tests
 *
 * Hand path extraction from step locations would fail silently — wrong
 * bigrams and grid mode would end up stored in Firestore with no error.
 * Deterministic hashing is load-bearing for content-addressable lookups.
 */

import { describe, it, expect } from "vitest";
import { createSoloProp } from "#lib/shared/foundation/services/solo-prop-factory.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  Orientation,
  MotionType,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { SoloPropStepData } from "#lib/shared/foundation/domain/models/solo-prop-step-data.js";

function makeStep(
  startLocation: GridLocation,
  endLocation: GridLocation,
  overrides: Partial<SoloPropStepData> = {}
): SoloPropStepData {
  return {
    startLocation,
    endLocation,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.OUT,
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    turns: 1,
    duration: 1,
    ...overrides,
  };
}

describe("SoloPropFactory", () => {
  const step1 = makeStep(GridLocation.NORTH, GridLocation.EAST);
  const step2 = makeStep(GridLocation.EAST, GridLocation.SOUTH);
  const step3 = makeStep(GridLocation.SOUTH, GridLocation.WEST);

  describe("hand path extraction", () => {
    it("extracts hand path locations as start of first step then end of each step", () => {
      const solo = createSoloProp(
        [step1, step2],
        GridLocation.NORTH,
        Orientation.IN
      );
      // Expected: [step1.startLocation, step1.endLocation, step2.endLocation]
      //         = [n, e, s]
      expect(solo.handPath.locations).toEqual([
        GridLocation.NORTH,
        GridLocation.EAST,
        GridLocation.SOUTH,
      ]);
    });

    it("extracts correct hand path for three steps", () => {
      const solo = createSoloProp(
        [step1, step2, step3],
        GridLocation.NORTH,
        Orientation.IN
      );
      expect(solo.handPath.locations).toEqual([
        GridLocation.NORTH,
        GridLocation.EAST,
        GridLocation.SOUTH,
        GridLocation.WEST,
      ]);
    });

    it("extracts correct hand path for a single step", () => {
      const solo = createSoloProp(
        [step1],
        GridLocation.NORTH,
        Orientation.IN
      );
      expect(solo.handPath.locations).toEqual([
        GridLocation.NORTH,
        GridLocation.EAST,
      ]);
    });
  });

  describe("length", () => {
    it("sets length to the number of steps", () => {
      const solo = createSoloProp(
        [step1, step2, step3],
        GridLocation.NORTH,
        Orientation.IN
      );
      expect(solo.length).toBe(3);
    });
  });

  describe("contentHash", () => {
    it("produces the same hash for identical inputs", () => {
      const solo1 = createSoloProp(
        [step1, step2],
        GridLocation.NORTH,
        Orientation.IN
      );
      const solo2 = createSoloProp(
        [step1, step2],
        GridLocation.NORTH,
        Orientation.IN
      );
      expect(solo1.contentHash).toBe(solo2.contentHash);
    });

    it("produces different hashes for different steps", () => {
      const solo1 = createSoloProp(
        [step1, step2],
        GridLocation.NORTH,
        Orientation.IN
      );
      const solo2 = createSoloProp(
        [step2, step1],
        GridLocation.EAST,
        Orientation.IN
      );
      expect(solo1.contentHash).not.toBe(solo2.contentHash);
    });

    it("produces different hashes for different start orientations", () => {
      const solo1 = createSoloProp(
        [step1],
        GridLocation.NORTH,
        Orientation.IN
      );
      const solo2 = createSoloProp(
        [step1],
        GridLocation.NORTH,
        Orientation.OUT
      );
      expect(solo1.contentHash).not.toBe(solo2.contentHash);
    });
  });

  describe("identity", () => {
    it("produces a unique id for each created solo prop", () => {
      const solo1 = createSoloProp([step1], GridLocation.NORTH, Orientation.IN);
      const solo2 = createSoloProp([step1], GridLocation.NORTH, Orientation.IN);
      expect(solo1.id).not.toBe(solo2.id);
    });
  });
});
