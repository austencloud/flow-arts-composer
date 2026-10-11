/**
 * Hand-Path Float Arrow Mirroring — Regression Test
 *
 * Level 1 gamma (hm-gamma) renders both props as HAND, so PictographPreparer's
 * hand-path mode converts the authored PRO shifts to FLOAT — and stamps the
 * HANDPATH direction onto `rotationDirection` (a float has no prop rotation).
 * shouldMirrorArrow keyed off that field, so every counter-clockwise hand float
 * got scale(-1, 1) and rendered its chevron reversed.
 *
 * Ground truth: float.svg points SE (+45°) at rotation 0, and the handpath maps
 * are pure chord geometry (rotation = chordAngle - 45). Unmirrored, red E→N at
 * NE renders 45 + 180 = 225° (up-left) = the S→N... i.e. the E→N chord. Mirrored,
 * it renders 315° (up-right) — what the bug report screenshot showed.
 */
import { describe, it, expect } from "vitest";
import { pictographPreparer } from "#lib/shared/pictograph/shared/services/pictograph-preparer.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { ArrowRotationCalculator } from "#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-rotation-calculator.js";
import { ArrowLocationCalculator } from "#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator.js";
import { shouldMirrorArrow } from "#lib/shared/pictograph/arrow/orchestration/services/arrow-positioning-orchestrator.js";
import type { ArrowPlacementData } from "#lib/shared/pictograph/arrow/positioning/placement/domain/arrow-placement-data.js";
import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import {
  floatClockwiseHandpathMap,
  floatCounterClockwiseHandpathMap,
} from "#lib/shared/pictograph/arrow/positioning/calculation/config/float-rotation-maps.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

/** Level 1 gamma Quarter-Opp step 1: blue S→W (cw handpath), red E→N (ccw). */
function gammaQuarterOppStep1(): PictographData {
  const motion = (hand: "left" | "right", s: string, e: string): MotionData =>
    createMotionData({
      motionType: "pro" as MotionData["motionType"],
      startLocation: s as MotionData["startLocation"],
      endLocation: e as MotionData["endLocation"],
      hand,
      propType: "hand" as MotionData["propType"],
      gridMode: "diamond" as MotionData["gridMode"],
    });
  return {
    id: "gamma-qo-1",
    letter: null,
    gridMode: "diamond",
    motions: {
      left: motion("left", "s", "w"),
      right: motion("right", "e", "n"),
    },
  } as unknown as PictographData;
}

const transformed = (
  pictographPreparer as unknown as {
    transformForHandPath(p: PictographData): PictographData;
  }
).transformForHandPath(gammaQuarterOppStep1());

const rotationCalc = new ArrowRotationCalculator();
const locationCalc = new ArrowLocationCalculator();

describe("hand-path float arrows are never mirrored", () => {
  it("keeps the handpath direction on rotationDirection (unchanged behavior)", () => {
    expect(transformed.motions.left!.motionType).toBe("float");
    expect(transformed.motions.left!.rotationDirection).toBe("cw");
    expect(transformed.motions.right!.rotationDirection).toBe("ccw");
  });

  it("does not mirror either hand float (ccw was the regression)", () => {
    const placeholder = {} as ArrowPlacementData;
    expect(
      shouldMirrorArrow(placeholder, transformed, transformed.motions.left!)
    ).toBe(false);
    expect(
      shouldMirrorArrow(placeholder, transformed, transformed.motions.right!)
    ).toBe(false);
  });

  it("renders each chevron along its hand's chord (rotation = chord - 45)", async () => {
    const cases = [
      { hand: "left" as const, loc: GridLocation.SOUTHWEST, rotation: 180 },
      { hand: "right" as const, loc: GridLocation.NORTHEAST, rotation: 180 },
    ];
    for (const c of cases) {
      const motion = transformed.motions[c.hand]!;
      const loc = await (
        locationCalc as unknown as {
          calculateLocation(
            m: MotionData,
            p: PictographData
          ): Promise<GridLocation>;
        }
      ).calculateLocation(motion, transformed);
      expect(loc).toBe(c.loc);
      expect(
        await rotationCalc.calculateRotation(motion, loc, transformed)
      ).toBe(c.rotation);
    }
  });
});

describe("float rotation maps are exact chord geometry", () => {
  // float.svg's chevron points SE (45deg) at rotation 0, so the correct rotation
  // for a shift is (angle of the start->end chord in screen coords) - 45.
  const COORD: Record<string, [number, number]> = {
    n: [0, -1],
    e: [1, 0],
    s: [0, 1],
    w: [-1, 0],
    ne: [1, -1],
    se: [1, 1],
    sw: [-1, 1],
    nw: [-1, -1],
  };
  const chordRotation = (start: string, end: string) => {
    const dx = COORD[end][0] - COORD[start][0];
    const dy = COORD[end][1] - COORD[start][1];
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI - 45;
    return ((Math.round(deg) % 360) + 360) % 360;
  };

  const CW: [string, string, string][] = [
    ["n", "e", "ne"],
    ["e", "s", "se"],
    ["s", "w", "sw"],
    ["w", "n", "nw"],
    ["ne", "se", "e"],
    ["se", "sw", "s"],
    ["sw", "nw", "w"],
    ["nw", "ne", "n"],
  ];
  const CCW: [string, string, string][] = [
    ["e", "n", "ne"],
    ["n", "w", "nw"],
    ["w", "s", "sw"],
    ["s", "e", "se"],
    ["se", "ne", "e"],
    ["ne", "nw", "n"],
    ["nw", "sw", "w"],
    ["sw", "se", "s"],
  ];

  for (const [start, end, arrow] of CW) {
    it(`cw ${start}->${end} at ${arrow}`, () => {
      expect(floatClockwiseHandpathMap[arrow as GridLocation]).toBe(
        chordRotation(start, end)
      );
    });
  }
  for (const [start, end, arrow] of CCW) {
    it(`ccw ${start}->${end} at ${arrow}`, () => {
      expect(floatCounterClockwiseHandpathMap[arrow as GridLocation]).toBe(
        chordRotation(start, end)
      );
    });
  }
});
