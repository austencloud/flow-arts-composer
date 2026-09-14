import {
  applyBoxMode,
  applyVariationDescriptor,
} from "$lib/features/choreo-card/services/deck-variation";
import { processReversals } from "$lib/shared/create/services/reversal-detector";
import {
  updateSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
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
  const base = (await loadTogetherOppositeLoops()).find(
    ({ id }) => id === loop.id
  );
  if (!base) throw new Error("The original sequence is unavailable.");
  const turnPattern = loop.sequence.steps
    .map((step, index) => {
      const changed = stepIndex === undefined || index === stepIndex;
      return `${changed ? leftTurns : step.motions.left.turns}|${changed ? rightTurns : step.motions.right.turns}`;
    })
    .join("-");
  // Always propagate from the original start pose, retaining the other edited
  // counts. The deck engine also reports whether this recipe still closes.
  const result = applyVariationDescriptor(base.sequence, { turnPattern }, []);
  return processReversals(
    updateSequenceData(result.sequence, {
      id: `${base.id}-turns-${turnPattern}`,
      metadata: {
        ...result.sequence.metadata,
        turnLoopClosed: result.turnLoopClosed,
      },
    })
  );
}
