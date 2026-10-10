import { describe, it, expect, vi } from "vitest";
import { calculateArrowPoint } from "#lib/shared/pictograph/arrow/orchestration/services/arrow-positioning-orchestrator.js";
import { calculateSegmentRotation } from "#lib/shared/pictograph/arrow/positioning/calculation/services/segment-rotation.js";
import { calculateOrientationAt } from "#lib/shared/animation-engine/services/orientation-at.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  MotionType,
  HandSide,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
// Routes are not under `#lib` — relative import. This __tests__ dir sits at
// src/lib/shared/pictograph/arrow/positioning/__tests__ — 6 path segments below
// src/ (lib/shared/pictograph/arrow/positioning/__tests__), so 6 "../" reaches
// src/, then descend into routes/.
import {
  poseAt,
  type HalfwayMotion,
} from "../../../../../../routes/(public)/guide/level-2/_data/halfway-pose";

vi.mock("#lib/shared/net/asset-fetch.js", () => ({
  assetFetch: vi.fn(async () =>
    new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  ),
}));

type Target = {
  name: string;
  motionType: MotionType;
  start: GridLocation;
  end: GridLocation;
  halfwayLoc: GridLocation;
  turns: number;
};

// The seven target half-motions the guide's turn pages need (all RED, staff,
// diamond, rotationDirection CLOCKWISE, IN→IN across the full motion — from
// the plan's scope table). Two of the seven ("ANTI E→S t2") share identical
// inputs — the guide distinguishes them by strip framing (halves vs the
// combined in→out strip), not by different half-arrow geometry. Both are kept
// as named cases to document that duplication intentionally (dup OK).
const TARGETS: Target[] = [
  {
    name: "PRO E→S t1",
    motionType: MotionType.PRO,
    start: GridLocation.EAST,
    end: GridLocation.SOUTH,
    halfwayLoc: GridLocation.SOUTHEAST,
    turns: 1,
  },
  {
    name: "ANTI E→S t1",
    motionType: MotionType.ANTI,
    start: GridLocation.EAST,
    end: GridLocation.SOUTH,
    halfwayLoc: GridLocation.SOUTHEAST,
    turns: 1,
  },
  {
    name: "PRO E→S t2",
    motionType: MotionType.PRO,
    start: GridLocation.EAST,
    end: GridLocation.SOUTH,
    halfwayLoc: GridLocation.SOUTHEAST,
    turns: 2,
  },
  {
    name: "ANTI E→S t2 (a)",
    motionType: MotionType.ANTI,
    start: GridLocation.EAST,
    end: GridLocation.SOUTH,
    halfwayLoc: GridLocation.SOUTHEAST,
    turns: 2,
  },
  {
    name: "ANTI E→S t2 (b, dup)",
    motionType: MotionType.ANTI,
    start: GridLocation.EAST,
    end: GridLocation.SOUTH,
    halfwayLoc: GridLocation.SOUTHEAST,
    turns: 2,
  },
  {
    name: "DASH S→N t2",
    motionType: MotionType.DASH,
    start: GridLocation.SOUTH,
    end: GridLocation.NORTH,
    halfwayLoc: GridLocation.CENTER,
    turns: 2,
  },
  {
    name: "STATIC E→E t2",
    motionType: MotionType.STATIC,
    start: GridLocation.EAST,
    end: GridLocation.EAST,
    halfwayLoc: GridLocation.EAST,
    turns: 2,
  },
];

/** OrientationAtInput-shaped object (Phase 1's calculateOrientationAt) for the
 *  full motion behind target `t`. */
function orientationInputFor(t: Target) {
  return {
    motionType: t.motionType,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: t.start,
    endLocation: t.end,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    turns: t.turns,
  };
}

/**
 * poseAt's `HalfwayMotion`-shaped object describing the SAME physical motion
 * as `orientationInputFor` — but `poseAt` destructures DIFFERENT field names
 * (type/from/to/rot/startOri/endOri vs motionType/startLocation/endLocation/
 * rotationDirection/startOrientation/endOrientation). Passing the wrong shape
 * silently degrades to poseAt's `{cx,cy,deg:0}` default (no thrown error) and
 * makes the ground-truth oracle meaningless — this footgun was already hit
 * once in Task 4; this helper is the one place that risk is fenced off.
 */
function poseInputFor(t: Target): HalfwayMotion {
  return {
    type: t.motionType,
    from: t.start,
    to: t.end,
    rot: RotationDirection.CLOCKWISE,
    startOri: Orientation.IN,
    endOri: Orientation.IN,
    turns: t.turns,
  };
}

describe("half-arrow pipeline — end-to-end over the seven guide motions (ground-truth oracle)", () => {
  for (const t of TARGETS) {
    it(`${t.name}: on-lattice halfway orientation, finite position, rotation matches the physical staff angle`, async () => {
      // (1) Halfway orientation must be non-null — all seven targets are
      // whole-turn, so they land on the 45° lattice.
      const halfwayOri = calculateOrientationAt(orientationInputFor(t), 0.5);
      expect(
        halfwayOri,
        `${t.name} must resolve a non-null halfway orientation (whole-turn ⇒ on-lattice)`
      ).not.toBeNull();

      const motion = createMotionData({
        motionType: t.motionType,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: t.start,
        endLocation: t.halfwayLoc,
        startOrientation: Orientation.IN,
        endOrientation: halfwayOri!,
        turns: t.turns,
        hand: HandSide.RIGHT,
        segment: { t0: 0, t1: 0.5 },
      });
      const picto = {
        letter: null,
        gridMode: motion.gridMode,
        motions: { right: motion, left: undefined },
      } as unknown as PictographData;

      const [x, y, rotation] = await calculateArrowPoint(picto, motion);

      // (2) Finite position.
      expect(Number.isFinite(x), `${t.name}: x must be finite, got ${x}`).toBe(true);
      expect(Number.isFinite(y), `${t.name}: y must be finite, got ${y}`).toBe(true);

      // (3) Self-consistency: the orchestrator's rotation must equal the pure
      // helper invoked with the same inputs (proves the segment path ran).
      const expectedSelf = calculateSegmentRotation(halfwayOri!, t.halfwayLoc, t.start);
      expect(
        rotation,
        `${t.name}: orchestrator rotation must match calculateSegmentRotation`
      ).toBeCloseTo(expectedSelf, 6);

      // (4) GROUND-TRUTH ORACLE — the pipeline rotation must equal the
      // physical staff angle the guide actually draws (poseAt sampling the
      // real animation engine), not merely be self-consistent with its own
      // helper. This is the assertion that actually catches a wrong formula.
      const poseDeg = ((poseAt(poseInputFor(t), 0.5).deg % 360) + 360) % 360;
      expect(
        Math.abs(((rotation - poseDeg + 540) % 360) - 180),
        `${t.name}: pipeline ${rotation}° vs physical ${poseDeg}°`
      ).toBeLessThan(1);
    });
  }
});
