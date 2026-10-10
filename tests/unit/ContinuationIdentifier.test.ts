/**
 * Tests for ContinuationIdentifier
 *
 * These tests catch silent bugs - if the continuation option is misidentified,
 * the user sees the wrong pictograph promoted to the first slot, which wouldn't
 * cause a crash but would silently break the UX expectation.
 */

import { describe, it, expect } from "vitest";
import { identifyContinuation } from "#lib/features/create/construct/option-picker/services/continuation-identifier.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  HandSide,
  MotionType,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

/**
 * Helper: create a minimal PictographData with specified motions.
 */
function makePictograph(
  left?: { start: GridLocation; end: GridLocation; motionType?: MotionType },
  right?: { start: GridLocation; end: GridLocation; motionType?: MotionType }
): PictographData {
  const motions: PictographData["motions"] = {};

  if (left) {
    motions.left = createMotionData({
      startLocation: left.start,
      endLocation: left.end,
      motionType: left.motionType ?? MotionType.PRO,
      hand: HandSide.LEFT,
    });
  }

  if (right) {
    motions.right = createMotionData({
      startLocation: right.start,
      endLocation: right.end,
      motionType: right.motionType ?? MotionType.PRO,
      hand: HandSide.RIGHT,
    });
  }

  return { id: crypto.randomUUID(), motions };
}

describe("ContinuationIdentifier", () => {

  describe("Type 1 continuation (both hands shift)", () => {
    it("picks the candidate that continues both shift directions", () => {
      // Reference: blue N->W (CCW), red N->E (CW)
      const reference = makePictograph(
        { start: GridLocation.NORTH, end: GridLocation.WEST },
        { start: GridLocation.NORTH, end: GridLocation.EAST }
      );

      // Continuation: blue W->S (CCW), red E->S (CW)
      const continuation = makePictograph(
        { start: GridLocation.WEST, end: GridLocation.SOUTH },
        { start: GridLocation.EAST, end: GridLocation.SOUTH }
      );

      // Wrong direction: blue W->N (CW), red E->N (CCW)
      const wrong = makePictograph(
        { start: GridLocation.WEST, end: GridLocation.NORTH },
        { start: GridLocation.EAST, end: GridLocation.NORTH }
      );

      const result = identifyContinuation(reference, [
        wrong,
        continuation,
      ]);
      expect(result).toBe(continuation);
    });

    it("prefers a 2-match over a 1-match", () => {
      // Reference: blue N->E (CW), red S->W (CW)
      const reference = makePictograph(
        { start: GridLocation.NORTH, end: GridLocation.EAST },
        { start: GridLocation.SOUTH, end: GridLocation.WEST }
      );

      // Both match: blue E->S (CW), red W->N (CW) -- score 2
      const bothMatch = makePictograph(
        { start: GridLocation.EAST, end: GridLocation.SOUTH },
        { start: GridLocation.WEST, end: GridLocation.NORTH }
      );

      // Only blue matches: blue E->S (CW), red dashes at W -- score 1
      const oneMatch = makePictograph(
        { start: GridLocation.EAST, end: GridLocation.SOUTH },
        {
          start: GridLocation.WEST,
          end: GridLocation.WEST,
          motionType: MotionType.DASH,
        }
      );

      const result = identifyContinuation(reference, [
        oneMatch,
        bothMatch,
      ]);
      expect(result).toBe(bothMatch);
    });
  });

  describe("Type 2 continuation (one hand shifts, one dashes)", () => {
    it("matches based on the shifting hand only", () => {
      // Reference: blue shifts N->E (CW), red dashes at E
      const reference = makePictograph(
        { start: GridLocation.NORTH, end: GridLocation.EAST },
        {
          start: GridLocation.EAST,
          end: GridLocation.EAST,
          motionType: MotionType.DASH,
        }
      );

      // Continuation: blue shifts E->S (CW), red dashes at S
      const continuation = makePictograph(
        { start: GridLocation.EAST, end: GridLocation.SOUTH },
        {
          start: GridLocation.SOUTH,
          end: GridLocation.SOUTH,
          motionType: MotionType.DASH,
        }
      );

      // Wrong: blue shifts E->N (CCW), red dashes at N
      const wrong = makePictograph(
        { start: GridLocation.EAST, end: GridLocation.NORTH },
        {
          start: GridLocation.NORTH,
          end: GridLocation.NORTH,
          motionType: MotionType.DASH,
        }
      );

      const result = identifyContinuation(reference, [
        wrong,
        continuation,
      ]);
      expect(result).toBe(continuation);
    });
  });

  describe("Types 4-6 (both hands dash/static)", () => {
    it("returns null when both hands dash", () => {
      const reference = makePictograph(
        {
          start: GridLocation.NORTH,
          end: GridLocation.NORTH,
          motionType: MotionType.DASH,
        },
        {
          start: GridLocation.SOUTH,
          end: GridLocation.SOUTH,
          motionType: MotionType.DASH,
        }
      );

      const candidate = makePictograph(
        {
          start: GridLocation.NORTH,
          end: GridLocation.NORTH,
          motionType: MotionType.DASH,
        },
        {
          start: GridLocation.SOUTH,
          end: GridLocation.SOUTH,
          motionType: MotionType.DASH,
        }
      );

      const result = identifyContinuation(reference, [candidate]);
      expect(result).toBeNull();
    });

    it("returns null when both hands are static", () => {
      const reference = makePictograph(
        {
          start: GridLocation.EAST,
          end: GridLocation.EAST,
          motionType: MotionType.STATIC,
        },
        {
          start: GridLocation.WEST,
          end: GridLocation.WEST,
          motionType: MotionType.STATIC,
        }
      );

      const result = identifyContinuation(reference, [
        makePictograph(
          { start: GridLocation.EAST, end: GridLocation.SOUTH },
          { start: GridLocation.WEST, end: GridLocation.NORTH }
        ),
      ]);
      expect(result).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("returns null for empty candidates array", () => {
      const reference = makePictograph(
        { start: GridLocation.NORTH, end: GridLocation.EAST },
        { start: GridLocation.SOUTH, end: GridLocation.WEST }
      );

      const result = identifyContinuation(reference, []);
      expect(result).toBeNull();
    });

    it("returns null for opposite-position movements (ambiguous)", () => {
      // N->S is 2 steps -- ambiguous, direction is null
      const reference = makePictograph(
        { start: GridLocation.NORTH, end: GridLocation.SOUTH },
        { start: GridLocation.EAST, end: GridLocation.WEST }
      );

      const candidate = makePictograph(
        { start: GridLocation.SOUTH, end: GridLocation.WEST },
        { start: GridLocation.WEST, end: GridLocation.NORTH }
      );

      const result = identifyContinuation(reference, [candidate]);
      expect(result).toBeNull();
    });

    it("works with box grid locations", () => {
      // Box grid: NE -> SE (CW), SW -> NW (CW)
      const reference = makePictograph(
        { start: GridLocation.NORTHEAST, end: GridLocation.SOUTHEAST },
        { start: GridLocation.SOUTHWEST, end: GridLocation.NORTHWEST }
      );

      // Continuation: SE -> SW (CW), NW -> NE (CW)
      const continuation = makePictograph(
        { start: GridLocation.SOUTHEAST, end: GridLocation.SOUTHWEST },
        { start: GridLocation.NORTHWEST, end: GridLocation.NORTHEAST }
      );

      const result = identifyContinuation(reference, [
        continuation,
      ]);
      expect(result).toBe(continuation);
    });

    it("disqualifies candidates with wrong shift direction", () => {
      // Reference: blue N->E (CW)
      const reference = makePictograph(
        { start: GridLocation.NORTH, end: GridLocation.EAST },
        {
          start: GridLocation.SOUTH,
          end: GridLocation.SOUTH,
          motionType: MotionType.DASH,
        }
      );

      // Only candidate: blue E->N (CCW) -- wrong direction
      const wrongDir = makePictograph(
        { start: GridLocation.EAST, end: GridLocation.NORTH },
        {
          start: GridLocation.SOUTH,
          end: GridLocation.SOUTH,
          motionType: MotionType.DASH,
        }
      );

      const result = identifyContinuation(reference, [wrongDir]);
      expect(result).toBeNull();
    });
  });
});
