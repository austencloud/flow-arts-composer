import generated from "./examples.json";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { createStartPlacementData } from "$lib/shared/foundation/domain/factories/create-start-placement-data";
import {
  createMotionData,
  type MotionData,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  GridMode,
  type GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";

// Frozen Flow Arts MCP output, generated September 8, 2026 with smooth constraints.
// The adapter supplies app fields; the MCP owns every motion and orientation.
export const motionPathExamples = generated.map((record) => {
  const boxes = record.steps.map((step) =>
    createStepData({
      id: `path-guide-${record.word}-${step.stepNumber}`,
      letter: step.letter as Letter,
      startPlacement: step.startPlacement as GridPlacement,
      endPlacement: step.endPlacement as GridPlacement,
      stepNumber: step.stepNumber,
      variation: step.variation,
      gridMode: GridMode.DIAMOND,
      motions: {
        left: createMotionData({
          ...(step.leftMotion as Partial<MotionData>),
          propType: PropType.STAFF,
          gridMode: GridMode.DIAMOND,
        }),
        right: createMotionData({
          ...(step.rightMotion as Partial<MotionData>),
          propType: PropType.STAFF,
          gridMode: GridMode.DIAMOND,
        }),
      },
    })
  );
  return createSequenceData({
    id: `path-guide-${record.word}`,
    word: record.word,
    name: record.word,
    gridMode: GridMode.DIAMOND,
    startPlacement: createStartPlacementData({
      ...boxes[0],
      gridPlacement: record.startPlacement as GridPlacement,
    }),
    steps: boxes.slice(1),
    isCircular: true,
  });
});
