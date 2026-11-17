/**
 * The example LOOPs for /lab/loop-words.
 *
 * Each one was built by the engine and confirmed by its detector
 * (scripts/loop-words-fixtures.ts writes the JSON), so the page shows real
 * LOOPs, not hand-made ones. The page's unit test checks them again with the
 * app's own detector.
 */
import { LOOPType } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { startPlacementDeriver } from "#lib/shared/pictograph/shared/services/start-placement-deriver.js";
import {
  hydrateCuratedSequence,
  type CuratedSequenceWire,
} from "#lib/shared/loop-explorer/domain/curated-seed-hydrator.js";
import examplesJson from "./loop-words-examples.json";

/** The five LOOP types, in the page's order. */
export const TYPE_ORDER = [
  "rotated",
  "reflected",
  "swapped",
  "inverted",
  "rewound",
] as const;
export type TypeKind = (typeof TYPE_ORDER)[number];
export type ExampleKind = TypeKind | "quartered";

type ExampleWire = CuratedSequenceWire & { readonly seedLength: number };

const LOOP_TYPE_OF: Record<ExampleKind, LOOPType> = {
  rotated: LOOPType.ROTATED,
  // The engine's left-right reflection (north-south axis).
  reflected: LOOPType.MIRRORED,
  swapped: LOOPType.SWAPPED,
  inverted: LOOPType.INVERTED,
  rewound: LOOPType.STRICT_REWOUND,
  quartered: LOOPType.ROTATED,
};

export interface LoopExample {
  readonly kind: ExampleKind;
  readonly sequence: SequenceData;
  /** Steps in the first pass (the part a person makes). */
  readonly seedLength: number;
  /** Times through: 2, or 4 for the quarter-turn example. */
  readonly passes: number;
}

function hydrate(kind: ExampleKind): LoopExample {
  const wire = (examplesJson as Record<string, ExampleWire>)[kind];
  if (!wire) throw new Error(`loop-words: no example for ${kind}`);
  const slice = kind === "quartered" ? "quartered" : "halved";
  return {
    kind,
    sequence: hydrateCuratedSequence(wire, LOOP_TYPE_OF[kind], slice, 0),
    seedLength: wire.seedLength,
    passes: slice === "quartered" ? 4 : 2,
  };
}

export const EXAMPLES: Record<ExampleKind, LoopExample> = {
  rotated: hydrate("rotated"),
  reflected: hydrate("reflected"),
  swapped: hydrate("swapped"),
  inverted: hydrate("inverted"),
  rewound: hydrate("rewound"),
  quartered: hydrate("quartered"),
};

/**
 * The 0-based index of the step that restates first-pass step `k` in pass
 * `pass` (pass 0 is the first pass itself). A Rewound LOOP plays its first
 * half backwards, so the twin of step k sits at the mirrored position.
 */
export function twinIndex(example: LoopExample, k: number, pass = 1): number {
  const n = example.seedLength;
  if (pass === 0) return k;
  if (example.kind === "rewound") return 2 * n - 1 - k;
  return k + pass * n;
}

/** The steps of one pass, in the order they are played. */
export function passSteps(example: LoopExample, pass: number): StepData[] {
  const n = example.seedLength;
  return example.sequence.steps.slice(pass * n, pass * n + n);
}

/**
 * A playable one-step sequence for `step`, starting from where that step
 * starts. Screen 2 puts one step and its five changed copies side by side.
 */
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

/**
 * Screen 2's step: the Rewound example's second step. Both hands spin, one
 * pro and one anti, and the step is not its own reflection across any of the
 * four lines or its own half turn, so every change looks different.
 */
export const SHOWCASE_STEP: StepData = EXAMPLES.rewound.sequence.steps[1]!;

/** The four lines a Reflected LOOP can reflect across (engine axis names). */
export const REFLECTION_AXES = [
  "north-south",
  "east-west",
  "northeast-southwest",
  "northwest-southeast",
] as const;
export type ReflectionLine = (typeof REFLECTION_AXES)[number];
