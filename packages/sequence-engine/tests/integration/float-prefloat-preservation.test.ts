/**
 * Integration test: float motions preserve prefloat type info.
 *
 * When TurnAllocator assigns "fl" to a pro/anti hand, SequenceBuilder converts
 * the motionType to "float" and zeros the rotation direction. The original
 * shift type (pro or anti) must be stored on the emitted motion as
 * `prefloatMotionType`, and the original rotation direction as
 * `prefloatRotationDirection`.
 *
 * Without this data, the TKA glyph renderer's TurnHandInterpreter has no
 * way to place the "fl" marker in the correct PAD slot (pro-top / anti-bottom)
 * for TYPE1_HYBRID letters, so both turn positions collapse to the same hand.
 *
 * Regression covered:
 *   Step 7 of a generated sequence showed letter R with the "fl" turn marker
 *   rendered in right even though the float was on the left (pro) hand.
 *   Root cause: engine dropped prefloatMotionType, so TYPE1_HYBRID pro/anti
 *   slot selection fell through to right for both slots.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SequenceBuilder } from "../../src/generation/builder/SequenceBuilder.js";
import type { IVariationProvider } from "../../src/generation/data/IVariationProvider.js";
import type { PictographData, MotionData } from "../../src/generation/constraints/types.js";
import { setLetterTransitionGraph } from "../../src/core/transition-graph/LetterTransitionGraph.js";
import type { ITransitionGraph } from "../../src/core/transition-graph/ITransitionGraph.js";
import type { PlacementGroup, LetterPlacementInfo } from "../../src/core/types/sequence-engine-types.js";

function makeMotion(overrides: Partial<MotionData> = {}): MotionData {
  return {
    hand: "left",
    startLocation: "n",
    endLocation: "s",
    motionType: "pro",
    rotationDirection: "cw",
    startOrientation: "in",
    endOrientation: "in",
    ...overrides,
  };
}

function makePictograph(overrides: Partial<PictographData> & { letter: string }): PictographData {
  return {
    startPlacement: "alpha1",
    endPlacement: "alpha1",
    timing: "together",
    direction: "together",
    leftMotion: makeMotion({ hand: "left" }),
    rightMotion: makeMotion({ hand: "right" }),
    ...overrides,
  };
}

// Mock dataset: enough variations to let level 3 turn allocation exercise "fl"
// on pro/anti hands across many runs. Both cw and ccw variants are present so
// rotation direction is non-trivial.
const MOCK_PICTOGRAPHS: PictographData[] = [
  makePictograph({
    letter: "α",
    startPlacement: "alpha1",
    endPlacement: "alpha1",
    leftMotion: makeMotion({ motionType: "static", rotationDirection: "noRotation", startLocation: "s", endLocation: "s" }),
    rightMotion: makeMotion({ motionType: "static", rotationDirection: "noRotation", startLocation: "n", endLocation: "n" }),
  }),
  makePictograph({
    letter: "α",
    startPlacement: "beta3",
    endPlacement: "beta3",
    leftMotion: makeMotion({ motionType: "static", rotationDirection: "noRotation", startLocation: "e", endLocation: "e" }),
    rightMotion: makeMotion({ motionType: "static", rotationDirection: "noRotation", startLocation: "n", endLocation: "n" }),
  }),

  // A: pro+pro shift, alpha1→beta3, both directions
  makePictograph({
    letter: "A",
    startPlacement: "alpha1",
    endPlacement: "beta3",
    leftMotion: makeMotion({ motionType: "pro", rotationDirection: "cw", startLocation: "s", endLocation: "e" }),
    rightMotion: makeMotion({ motionType: "pro", rotationDirection: "cw", startLocation: "n", endLocation: "e" }),
  }),
  makePictograph({
    letter: "A",
    startPlacement: "alpha1",
    endPlacement: "beta3",
    leftMotion: makeMotion({ motionType: "pro", rotationDirection: "ccw", startLocation: "s", endLocation: "e" }),
    rightMotion: makeMotion({ motionType: "pro", rotationDirection: "ccw", startLocation: "n", endLocation: "e" }),
  }),

  // B: pro+pro shift, beta3→alpha1, both directions
  makePictograph({
    letter: "B",
    startPlacement: "beta3",
    endPlacement: "alpha1",
    leftMotion: makeMotion({ motionType: "pro", rotationDirection: "cw", startLocation: "e", endLocation: "s" }),
    rightMotion: makeMotion({ motionType: "pro", rotationDirection: "cw", startLocation: "e", endLocation: "n" }),
  }),
  makePictograph({
    letter: "B",
    startPlacement: "beta3",
    endPlacement: "alpha1",
    leftMotion: makeMotion({ motionType: "pro", rotationDirection: "ccw", startLocation: "e", endLocation: "s" }),
    rightMotion: makeMotion({ motionType: "pro", rotationDirection: "ccw", startLocation: "e", endLocation: "n" }),
  }),

  // G: anti+anti shift (pair with A so we also exercise anti→float)
  makePictograph({
    letter: "G",
    startPlacement: "alpha1",
    endPlacement: "beta3",
    leftMotion: makeMotion({ motionType: "anti", rotationDirection: "ccw", startLocation: "s", endLocation: "e" }),
    rightMotion: makeMotion({ motionType: "anti", rotationDirection: "cw", startLocation: "n", endLocation: "e" }),
  }),
  makePictograph({
    letter: "G",
    startPlacement: "alpha1",
    endPlacement: "beta3",
    leftMotion: makeMotion({ motionType: "anti", rotationDirection: "cw", startLocation: "s", endLocation: "e" }),
    rightMotion: makeMotion({ motionType: "anti", rotationDirection: "ccw", startLocation: "n", endLocation: "e" }),
  }),

  // H: anti+anti shift, beta3→alpha1
  makePictograph({
    letter: "H",
    startPlacement: "beta3",
    endPlacement: "alpha1",
    leftMotion: makeMotion({ motionType: "anti", rotationDirection: "ccw", startLocation: "e", endLocation: "s" }),
    rightMotion: makeMotion({ motionType: "anti", rotationDirection: "cw", startLocation: "e", endLocation: "n" }),
  }),
  makePictograph({
    letter: "H",
    startPlacement: "beta3",
    endPlacement: "alpha1",
    leftMotion: makeMotion({ motionType: "anti", rotationDirection: "cw", startLocation: "e", endLocation: "s" }),
    rightMotion: makeMotion({ motionType: "anti", rotationDirection: "ccw", startLocation: "e", endLocation: "n" }),
  }),
];

class MockVariationProvider implements IVariationProvider {
  getVariations(letter: string, startPlacement: string, _gridMode: string): PictographData[] {
    return MOCK_PICTOGRAPHS.filter((p) => p.letter === letter && p.startPlacement === startPlacement);
  }

  getAllVariations(_gridMode: string): PictographData[] {
    return MOCK_PICTOGRAPHS;
  }
}

const mockTransitionGraph: ITransitionGraph = {
  findBridgeLetters: () => [],
  findAllBridgeOptions: () => [],
  getPlacementGroup: (pos: string): PlacementGroup => {
    if (pos.startsWith("alpha")) return "alpha" as PlacementGroup;
    if (pos.startsWith("beta")) return "beta" as PlacementGroup;
    return "gamma" as PlacementGroup;
  },
  getLetterPlacementInfo: (letter: string): LetterPlacementInfo | null => {
    const info: Record<string, LetterPlacementInfo> = {
      A: { letter: "A", startGroups: ["alpha" as PlacementGroup], endGroups: ["beta" as PlacementGroup] },
      B: { letter: "B", startGroups: ["beta" as PlacementGroup], endGroups: ["alpha" as PlacementGroup] },
      G: { letter: "G", startGroups: ["alpha" as PlacementGroup], endGroups: ["beta" as PlacementGroup] },
      H: { letter: "H", startGroups: ["beta" as PlacementGroup], endGroups: ["alpha" as PlacementGroup] },
    };
    return info[letter] ?? null;
  },
};

describe("Float motions preserve prefloat type info", () => {
  beforeEach(() => {
    setLetterTransitionGraph(mockTransitionGraph);
  });

  it("every emitted float motion carries prefloatMotionType and prefloatRotationDirection", () => {
    const provider = new MockVariationProvider();
    let floatsSeen = 0;
    const violations: string[] = [];

    // Level 3 enables "fl" in the turn pool. 200 runs gives high confidence
    // the allocator hit at least one fl on a shift hand.
    for (let run = 0; run < 200; run++) {
      const builder = new SequenceBuilder(provider);
      const result = builder.build({
        length: 6,
        gridMode: "diamond",
        level: 3,
        maxTurnIntensity: 3,
      });

      for (let i = 0; i < result.sequence.length; i++) {
        const step = result.sequence[i]!;
        for (const hand of ["left", "right"] as const) {
          const motion = hand === "left" ? step.motions.left : step.motions.right;
          if (motion.motionType !== "float") continue;

          floatsSeen++;

          if (!motion.prefloatMotionType) {
            violations.push(
              `run ${run} step ${i} ${hand}: float missing prefloatMotionType`,
            );
            continue;
          }

          if (motion.prefloatMotionType !== "pro" && motion.prefloatMotionType !== "anti") {
            violations.push(
              `run ${run} step ${i} ${hand}: prefloatMotionType=${motion.prefloatMotionType}, expected pro or anti`,
            );
          }

          if (!motion.prefloatRotationDirection) {
            violations.push(
              `run ${run} step ${i} ${hand}: float missing prefloatRotationDirection`,
            );
            continue;
          }

          if (
            motion.prefloatRotationDirection !== "cw" &&
            motion.prefloatRotationDirection !== "ccw"
          ) {
            violations.push(
              `run ${run} step ${i} ${hand}: prefloatRotationDirection=${motion.prefloatRotationDirection}, expected cw or ccw`,
            );
          }
        }
      }
    }

    expect(floatsSeen, "test should exercise at least one float across 200 runs").toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });

  it("non-float motions never carry prefloat fields", () => {
    const provider = new MockVariationProvider();
    const violations: string[] = [];

    for (let run = 0; run < 50; run++) {
      const builder = new SequenceBuilder(provider);
      const result = builder.build({
        length: 6,
        gridMode: "diamond",
        level: 3,
        maxTurnIntensity: 3,
      });

      for (let i = 0; i < result.sequence.length; i++) {
        const step = result.sequence[i]!;
        for (const hand of ["left", "right"] as const) {
          const motion = hand === "left" ? step.motions.left : step.motions.right;
          if (motion.motionType === "float") continue;

          if (motion.prefloatMotionType !== undefined) {
            violations.push(
              `run ${run} step ${i} ${hand}: non-float (${motion.motionType}) has prefloatMotionType=${motion.prefloatMotionType}`,
            );
          }
          if (motion.prefloatRotationDirection !== undefined) {
            violations.push(
              `run ${run} step ${i} ${hand}: non-float (${motion.motionType}) has prefloatRotationDirection=${motion.prefloatRotationDirection}`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
