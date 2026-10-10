import rawFixtures from "../../../../tests/fixtures/loop-audit/real-loop-fixtures.json";
import {
  createSequenceData,
  type SequenceData,
} from "#lib/shared/foundation/domain/models/sequence-data.js";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  TUNNEL_LAYER_COLORS,
  type TunnelLayerConfig,
} from "#lib/shared/animation-engine/domain/compose-types.js";
import type { ArrangementSnapshot } from "#lib/shared/media-composition/domain/arrangement.js";
import { createArrangementProject } from "#lib/shared/media-composition/domain/post-arrangement-item.js";

type RawStep = {
  stepNumber: number;
  motions: { blue: Record<string, unknown>; red: Record<string, unknown> };
} & Record<string, unknown>;
type RawLoop = { seedWord: string; steps: RawStep[] };

/** Preserve the generated LOOP's actual motions while lifting its legacy start beat. */
function fromCorpus(raw: RawLoop, id: string): SequenceData {
  const steps = raw.steps.map((step) =>
    createStepData({
      ...step,
      motions: {
        left: createMotionData({
          ...step.motions.blue,
          hand: HandSide.LEFT,
        } as never),
        right: createMotionData({
          ...step.motions.red,
          hand: HandSide.RIGHT,
        } as never),
      },
    } as never)
  );
  const start = steps.find((step) => step.stepNumber === 0);
  return createSequenceData({
    id,
    name: raw.seedWord,
    word: raw.seedWord,
    steps: steps.filter((step) => step.stepNumber > 0),
    isCircular: true,
    ...(start && {
      startPlacement: {
        id: start.id,
        isStartPlacement: true,
        motions: start.motions,
        gridMode: start.gridMode,
        gridPlacement: start.startPlacement,
      } as never,
    }),
  });
}

function layer(sequence: SequenceData, colorIndex: number): TunnelLayerConfig {
  return {
    sequence,
    beatOffset: 0,
    propColors: TUNNEL_LAYER_COLORS[colorIndex]!,
    transformStack: [],
  };
}

export function createStudioArrangementFixture() {
  const [first, second] = (rawFixtures as unknown as { rotated: RawLoop[] })
    .rotated;
  if (!first || !second)
    throw new Error("The generated LOOP fixture is incomplete.");
  const primary = fromCorpus(first, "test-studio-arrangement-real-loop");
  const secondary = fromCorpus(second, "test-studio-arrangement-second-loop");
  // Arrange stores the result of a transform in the layer sequence as well as
  // recording its operation. Shift-start rotates these eight real corpus beats.
  const transformed: SequenceData = {
    ...primary,
    id: "test-studio-arrangement-shifted-loop",
    steps: [...primary.steps.slice(1), primary.steps[0]!],
  };
  const cells: ArrangementSnapshot["cells"] = Array.from(
    { length: 64 },
    (_, index) => {
      const row = Math.floor(index / 8);
      const col = index % 8;
      const layers =
        row === 0 && col === 0
          ? [layer(primary, 0), layer(secondary, 1)]
          : row === 0 && col === 1
            ? [
                {
                  ...layer(transformed, 2),
                  transformStack: [
                    {
                      type: "shiftStart" as const,
                      hand: "both" as const,
                      timestamp: 0,
                    },
                  ],
                },
              ]
            : row === 1 && col === 0
              ? [layer(secondary, 3)]
              : row === 1 && col === 1
                ? [layer(primary, 1)]
                : [];
      return {
        id: `cell-${row}-${col}`,
        row,
        col,
        layers,
        beatOffset: 0,
        colSpan: 1,
        rowSpan: 1,
        mediaType: "animation" as const,
      };
    }
  );
  const snapshot: ArrangementSnapshot = {
    schemaVersion: 1,
    cells,
    gridRows: 2,
    gridCols: 2,
    bpm: 240,
    skipStartPlacement: true,
  };
  return {
    sequence: primary,
    snapshot,
    project: createArrangementProject(snapshot, primary.id, 1_700_000_000_000),
  };
}
