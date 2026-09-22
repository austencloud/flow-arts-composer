/**
 * Tests for BuildResultTransformer's word calculation.
 *
 * convertToSequenceData used to assemble the word with a raw
 * steps.filter(s => s.letter).map(s => s.letter).join(""). Before the
 * skewed-frame notation existed, that was equivalent. It now derives the
 * word with deriveWordFromBeats so a skewed run (zeta/eta start or end
 * placement) is wrapped in braces, matching every other beats-to-word site.
 */
import { describe, it, expect } from "vitest";
import {
  createStep,
  createStartStep,
  createMotion,
  Letter,
  GridPlacement,
  GridLocation,
  MotionType,
  RotationDirection,
  Orientation,
  Plane,
  HandSide,
} from "@tka/tka-types";
import type { Motion } from "@tka/tka-types";
import type { BuildResult } from "@tka/sequence-engine/generation";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  DifficultyLevel,
  type GenerationOptions,
} from "$lib/shared/foundation/domain/models/generation/generate-models";
import { sequenceMetadataManager } from "./sequence-metadata-manager";
import { reversalDetector } from "./reversal-detector";
import { BuildResultTransformer } from "./build-result-transformer";

const options: GenerationOptions = {
  length: 3,
  gridMode: GridMode.DIAMOND,
  propType: PropType.FAN,
  difficulty: DifficultyLevel.BEGINNER,
};

/** A static hold at a single grid location, for one hand. */
function handMotion(hand: HandSide, location: GridLocation): Motion {
  return createMotion({
    motionType: MotionType.static,
    startLocation: location,
    endLocation: location,
    rotationDirection: RotationDirection.noRotation,
    startOrientation: Orientation.in,
    endOrientation: Orientation.in,
    turns: 0,
    plane: Plane.wall,
    hand,
  });
}

/**
 * A minimal BuildResult. convertToSequenceData only reads `sequence` (and
 * `loop`, omitted here for a non-circular result), so the other BuildResult
 * fields (constraintReport, metrics, turnAllocation, ...) are left out.
 */
function buildResultFor(steps: ReturnType<typeof createStep>[]): BuildResult {
  const startStep = createStartStep(GridPlacement.alpha1);
  return {
    sequence: [startStep, ...steps],
  } as unknown as BuildResult;
}

describe("BuildResultTransformer word calculation", () => {
  const transformer = new BuildResultTransformer(
    sequenceMetadataManager,
    reversalDetector
  );

  it("keeps the word unbraced when no step is skewed", async () => {
    const stepA = createStep({
      letter: Letter.A,
      startPlacement: GridPlacement.alpha1,
      endPlacement: GridPlacement.alpha1,
      motions: {
        left: handMotion(HandSide.LEFT, GridLocation.n),
        right: handMotion(HandSide.RIGHT, GridLocation.s),
      },
      stepNumber: 1,
    });
    const stepB = createStep({
      letter: Letter.B,
      startPlacement: GridPlacement.alpha2,
      endPlacement: GridPlacement.alpha2,
      motions: {
        left: handMotion(HandSide.LEFT, GridLocation.e),
        right: handMotion(HandSide.RIGHT, GridLocation.w),
      },
      stepNumber: 2,
    });

    const result = await transformer.convertToSequenceData(
      buildResultFor([stepA, stepB]),
      options
    );

    expect(result.word).toBe("AB");
  });

  it("braces a step whose start placement is a zeta placement", async () => {
    const stepA = createStep({
      letter: Letter.A,
      startPlacement: GridPlacement.alpha1,
      endPlacement: GridPlacement.alpha1,
      motions: {
        left: handMotion(HandSide.LEFT, GridLocation.n),
        right: handMotion(HandSide.RIGHT, GridLocation.s),
      },
      stepNumber: 1,
    });
    const stepB = createStep({
      letter: Letter.B,
      startPlacement: GridPlacement.alpha2,
      endPlacement: GridPlacement.alpha2,
      motions: {
        left: handMotion(HandSide.LEFT, GridLocation.e),
        right: handMotion(HandSide.RIGHT, GridLocation.w),
      },
      stepNumber: 2,
    });
    const stepC = createStep({
      letter: Letter.C,
      startPlacement: GridPlacement.zeta3,
      endPlacement: GridPlacement.zeta3,
      motions: {
        // One hand cardinal, the other intercardinal: a mixed pair is what
        // makes a beat skewed (zeta/eta start or end), per isSkewedFrameBeat
        // in shared/foundation/services/skewed-frame.ts.
        left: handMotion(HandSide.LEFT, GridLocation.n),
        right: handMotion(HandSide.RIGHT, GridLocation.ne),
      },
      stepNumber: 3,
    });

    const result = await transformer.convertToSequenceData(
      buildResultFor([stepA, stepB, stepC]),
      options
    );

    expect(result.word).toBe("AB{C}");
  });
});
