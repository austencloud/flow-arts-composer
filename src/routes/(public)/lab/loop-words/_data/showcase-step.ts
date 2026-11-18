/**
 * The page's one step, written out. Both hands spin, one pro and one anti,
 * and the step is not its own reflection across any of the four lines or its
 * own turn, so every change looks different. It was the second step of an
 * engine-built Rewound LOOP; showcase-twins.test.ts checks it stays that kind
 * of step.
 */
import { LOOPType } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import {
  createSequenceData,
  type SequenceData,
} from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { startPlacementDeriver } from "#lib/shared/pictograph/shared/services/start-placement-deriver.js";
import {
  hydrateCuratedSequence,
  type CuratedSequenceWire,
} from "#lib/shared/loop-explorer/domain/curated-seed-hydrator.js";

const WIRE: CuratedSequenceWire = {
  word: "O",
  startPlacement: "gamma1",
  steps: [
    {
      letter: "O",
      startPlacement: "gamma1",
      endPlacement: "gamma11",
      stepNumber: 1,
      leftMotion: {
        motionType: "pro",
        startLocation: "w",
        endLocation: "s",
        rotationDirection: "ccw",
        startOrientation: "out",
        endOrientation: "out",
        turns: 0,
        plane: "wall",
      },
      rightMotion: {
        motionType: "anti",
        startLocation: "n",
        endLocation: "e",
        rotationDirection: "ccw",
        startOrientation: "out",
        endOrientation: "in",
        turns: 0,
        plane: "wall",
      },
    },
  ],
};

// The curated converter is the app's one trusted path from this compact form
// to step data; the LOOP type it asks for only names the sequence it builds.
export const SHOWCASE_STEP: StepData = hydrateCuratedSequence(
  WIRE,
  LOOPType.STRICT_REWOUND,
  "halved",
  0
).steps[0]!;

/** A playable one-step sequence for `step`, starting where that step starts. */
export function oneStepSequence(step: StepData, id: string): SequenceData {
  const only = createStepData({ ...step, id: `${id}-step`, stepNumber: 1 });
  return createSequenceData({
    id,
    name: id,
    word: "",
    steps: [only],
    startPlacement: startPlacementDeriver.deriveFromFirstStep(only),
    gridMode: GridMode.DIAMOND,
  });
}
