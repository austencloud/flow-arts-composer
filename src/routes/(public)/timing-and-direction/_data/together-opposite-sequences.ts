import {
  applyBoxMode,
  applyVariationDescriptor,
} from "$lib/features/choreo-card/services/deck-variation";
import { processReversals } from "$lib/shared/create/services/reversal-detector";
import {
  flipSequence,
  mirrorSequence,
  rotateSequence,
  swapHands,
} from "$lib/shared/create/services/sequence-transformer";
import {
  updateSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import { deriveWord } from "$lib/shared/foundation/services/word-deriver";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { TnDMode } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { deriveTnDFromPictograph } from "$lib/shared/pictograph/shared/domain/utils/tnd-deriver";

export interface TogetherOppositeLoop {
  readonly id: string;
  readonly word: string;
  readonly gridMode: GridMode;
  readonly spinLabel: string;
  readonly sequence: SequenceData;
}

export type TogetherOppositeTransform =
  | "mirror"
  | "flip"
  | "rotate-clockwise"
  | "rotate-counterclockwise"
  | "swap";

const GROUPS = [
  { gridMode: GridMode.DIAMOND, words: ["DJDJ", "EKEK", "FLFL"] },
  { gridMode: GridMode.BOX, words: ["MPMP", "NQNQ", "OROR"] },
] as const;
const SPINS = ["Pro-spin", "Anti-spin", "Mixed"] as const;

export function selectTogetherOppositeLoops(
  sequences: readonly SequenceData[]
): TogetherOppositeLoop[] {
  return GROUPS.flatMap(({ gridMode, words }) =>
    words.map((word, index) => {
      const source = sequences.find((sequence) => sequence.word === word);
      if (!source)
        throw new Error(`The canonical ${word} sequence is unavailable.`);
      // The box versions change timing under rotation; the word alone cannot
      // establish which family the actual paths belong to.
      const sequence = applyBoxMode(source, gridMode);
      if (
        sequence.steps.length !== 4 ||
        !sequence.steps.every(
          (step) => deriveTnDFromPictograph(step).tndMode === TnDMode.TOG_OPP
        )
      ) {
        throw new Error(
          `${word} does not contain four Together–Opposite steps.`
        );
      }
      const id = `to-${gridMode}-${word.toLowerCase()}`;
      return {
        id,
        word,
        gridMode,
        spinLabel: SPINS[index]!,
        sequence: processReversals(
          updateSequenceData(sequence, {
            id,
            gridMode,
            metadata: { ...sequence.metadata, familyId: "tog-opp" },
          })
        ),
      };
    })
  );
}

export async function loadTogetherOppositeLoops(): Promise<
  TogetherOppositeLoop[]
> {
  const { loadCanonicalTnDBaseSequences } =
    await import("$lib/features/browse/gallery-home/canonical-tnd-pool");
  return selectTogetherOppositeLoops(await loadCanonicalTnDBaseSequences());
}

export async function adjustTogetherOppositeLoop(
  loop: TogetherOppositeLoop,
  leftTurns: number,
  rightTurns: number,
  stepIndex?: number
): Promise<SequenceData> {
  if (
    [leftTurns, rightTurns].some(
      (turns) =>
        !Number.isFinite(turns) ||
        turns < 0 ||
        turns > 3 ||
        (turns * 2) % 1 !== 0
    )
  )
    throw new Error("Choose turns from 0 to 3 in half-turn increments.");
  if (
    stepIndex !== undefined &&
    (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= 4)
  ) {
    throw new Error("Choose one of the four steps.");
  }
  const turnPattern = loop.sequence.steps
    .map((step, index) => {
      const changed = stepIndex === undefined || index === stepIndex;
      return `${changed ? leftTurns : step.motions.left.turns}|${changed ? rightTurns : step.motions.right.turns}`;
    })
    .join("-");
  // Build from the displayed sequence so turns compose with spatial edits.
  // Reapplying a pattern replaces the selected counts without losing the
  // geometry already chosen for this card.
  const result = applyVariationDescriptor(loop.sequence, { turnPattern }, []);
  return processReversals(
    updateSequenceData(result.sequence, {
      id: `${loop.id}-turns-${turnPattern}`,
      metadata: {
        ...result.sequence.metadata,
        // applyVariationDescriptor compares against its input, which is useful
        // for deck variations but can hide a seam that was already open. The
        // player needs the actual final geometry.
        turnLoopClosed: loopCloses(result.sequence),
      },
    })
  );
}

/** Resolve a turn edit for every displayed card before the caller replaces its deck. */
export async function adjustTogetherOppositeLoops(
  loops: readonly TogetherOppositeLoop[],
  leftTurns: number,
  rightTurns: number,
  stepIndex?: number
): Promise<TogetherOppositeLoop[]> {
  return Promise.all(
    loops.map(async (loop) => ({
      ...loop,
      sequence: await adjustTogetherOppositeLoop(
        loop,
        leftTurns,
        rightTurns,
        stepIndex
      ),
    }))
  );
}

/** Apply one canonical geometric action to the actual sequence on a card. */
export async function transformTogetherOppositeLoop(
  loop: TogetherOppositeLoop,
  transform: TogetherOppositeTransform
): Promise<SequenceData> {
  let transformed: SequenceData;
  switch (transform) {
    case "mirror":
      transformed = await mirrorSequence(loop.sequence);
      break;
    case "flip":
      transformed = await flipSequence(loop.sequence);
      break;
    case "rotate-clockwise":
      transformed = await rotateSequence(loop.sequence, 1);
      break;
    case "rotate-counterclockwise":
      transformed = await rotateSequence(loop.sequence, -1);
      break;
    case "swap":
      transformed = swapHands(loop.sequence);
      break;
  }

  const withWord = updateSequenceData(transformed, {
    id: `${loop.id}-${transform}`,
    word: deriveWord(transformed),
    metadata: {
      ...transformed.metadata,
      turnLoopClosed: loopCloses(transformed),
    },
  });
  return processReversals(withWord);
}

/** Resolve one geometric action for every displayed card as one replacement deck. */
export async function transformTogetherOppositeLoops(
  loops: readonly TogetherOppositeLoop[],
  transform: TogetherOppositeTransform
): Promise<TogetherOppositeLoop[]> {
  return Promise.all(
    loops.map(async (loop) => {
      const sequence = await transformTogetherOppositeLoop(loop, transform);
      return {
        ...loop,
        sequence,
        gridMode: sequence.gridMode ?? loop.gridMode,
      };
    })
  );
}

function loopCloses(sequence: SequenceData): boolean {
  const first = sequence.steps[0];
  const last = sequence.steps[sequence.steps.length - 1];
  if (!first || !last) return true;
  return (
    first.motions.left.startOrientation === last.motions.left.endOrientation &&
    first.motions.right.startOrientation === last.motions.right.endOrientation
  );
}
