/**
 * A joined sequence keeps its one join through QR encoding, on the flat path
 * and on the recipe (r1) path. The recipe encoder only emits a recipe when
 * rebuilding the sequence from its seed gives back the same flat bytes, so a
 * join the rebuild would lose sends the sequence down the flat path instead.
 */
import { describe, expect, it } from "vitest";
import { compressForQR } from "$lib/shared/navigation/services/sequence-codec";
import {
  decodeSequence,
  decodeSequenceFromQR,
  encodeSequence,
  encodeSequenceForQR,
} from "$lib/shared/navigation/services/sequence-encoder";
import { CompositionalEncoder } from "$lib/shared/qr/services/compositional-encoder";
import { registerLoopDetector } from "$lib/shared/create/get-loop-detector";
import {
  LOOPType as EngineLOOPType,
  Period as EnginePeriod,
  loopExecutorSelector,
} from "@tka/sequence-engine/loop";
import { Period } from "$lib/shared/foundation/domain/models/generation/circular-models";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  HandSide,
  MotionType,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  GridLocation,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  buildJoinFixture,
  joinOf,
  JOIN_EAST_ONE,
  JOIN_NORTHEAST_TWO,
  type JoinFixtureOptions,
} from "../grid-join/grid-join-fixtures";

// Report every sequence as a strict quartered rotation: the encoder's own
// round-trip check then decides whether a recipe is exact.
registerLoopDetector({
  detectLOOPType: () => ({
    isCircular: true,
    loopType: "rotated",
    period: Period.QUARTERED,
    confidence: "strict",
  }),
} as Parameters<typeof registerLoopDetector>[0]);

type MotionInput = Parameters<typeof createMotionData>[0];

function cell(
  stepNumber: number,
  left: MotionInput,
  right: MotionInput,
  extra: Partial<StepData> = {}
): StepData {
  return {
    id: `loop-step-${stepNumber}`,
    stepNumber,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    letter: null,
    startPlacement: null,
    endPlacement: null,
    motions: {
      left: createMotionData({ ...left, hand: HandSide.LEFT }),
      right: createMotionData({ ...right, hand: HandSide.RIGHT }),
    },
    ...extra,
  };
}

interface LoopOptions {
  readonly sequenceJoin?: JoinFixtureOptions["sequenceJoin"];
}

/** A rotated, quartered LOOP: one seed step run round the four quarters. */
function buildLoop(options: LoopOptions = {}): SequenceData {
  const hold = { motionType: MotionType.STATIC, turns: 0 };
  const start = cell(
    0,
    {
      ...hold,
      startLocation: GridLocation.SOUTH,
      endLocation: GridLocation.SOUTH,
    },
    {
      ...hold,
      startLocation: GridLocation.NORTH,
      endLocation: GridLocation.NORTH,
    },
    {
      startPlacement: GridPlacement.ALPHA1,
      endPlacement: GridPlacement.ALPHA1,
    }
  );
  const seed = cell(
    1,
    {
      motionType: MotionType.PRO,
      rotationDirection: RotationDirection.CLOCKWISE,
      startLocation: GridLocation.SOUTH,
      endLocation: GridLocation.WEST,
      turns: 0,
    },
    {
      motionType: MotionType.PRO,
      rotationDirection: RotationDirection.CLOCKWISE,
      startLocation: GridLocation.NORTH,
      endLocation: GridLocation.EAST,
      turns: 0,
    },
    {
      startPlacement: GridPlacement.ALPHA1,
      endPlacement: GridPlacement.ALPHA3,
    }
  );
  const completed = loopExecutorSelector
    .getExecutor(EngineLOOPType.ROTATED)
    .executeLOOP([start, seed], EnginePeriod.QUARTERED) as StepData[];
  const startCell = completed.find((step) => step.stepNumber === 0)!;

  return createSequenceData({
    word: "TEST",
    name: "Join loop",
    steps: completed.filter((step) => step.stepNumber > 0),
    startPlacement: {
      id: startCell.id,
      letter: startCell.letter,
      gridPlacement: startCell.startPlacement,
      startPlacement: startCell.startPlacement,
      endPlacement: startCell.endPlacement,
      motions: startCell.motions,
    },
    ...(options.sequenceJoin && { conjoined: options.sequenceJoin }),
  });
}

const encoder = new CompositionalEncoder(
  { encode: encodeSequence },
  { decode: decodeSequence },
  { compressString: compressForQR }
);

describe("flat QR encoding", () => {
  const options: readonly JoinFixtureOptions[] = [
    { sequenceJoin: JOIN_EAST_ONE },
    { sequenceJoin: JOIN_NORTHEAST_TWO, handPath: true },
  ];

  it.each(options)("keeps the join of %j", async (join) => {
    const sequence = buildJoinFixture(join);
    const qr = await encodeSequenceForQR(sequence);
    const decoded = await decodeSequenceFromQR(qr);

    expect(qr.startsWith("s~")).toBe(true);
    expect(joinOf(decoded)).toEqual(joinOf(sequence));
  });
});

describe("recipe QR encoding", () => {
  it("builds a quartered LOOP the recipe encoder can use", async () => {
    const plain = buildLoop();

    expect(plain.steps).toHaveLength(4);
    const recipe = await encoder.tryEncode(encodeSequence(plain), plain);
    expect(recipe?.startsWith("r1:")).toBe(true);
  });

  it("keeps the sequence's join in the seed, the recipe and the rebuilt sequence", async () => {
    const sequence = buildLoop({ sequenceJoin: JOIN_NORTHEAST_TWO });
    const flat = encodeSequence(sequence);
    const recipe = await encoder.tryEncode(flat, sequence);

    expect(flat.split("|")[0]).toMatch(/Jne2$/);
    expect(recipe?.startsWith("r1:")).toBe(true);

    const decoded = await decodeSequenceFromQR(`s~${recipe}`);
    expect(decoded.conjoined).toEqual(JOIN_NORTHEAST_TWO);
    expect(encodeSequence(decoded)).toBe(flat);
  });

  it("takes the recipe path through encodeSequenceForQR", async () => {
    const sequence = buildLoop({ sequenceJoin: JOIN_EAST_ONE });
    const qr = await encodeSequenceForQR(sequence);

    expect(qr.startsWith("s~r1:")).toBe(true);
    expect(joinOf(await decodeSequenceFromQR(qr))).toEqual(joinOf(sequence));
  });
});
