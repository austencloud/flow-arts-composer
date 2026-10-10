import {
  applyBoxMode,
  applyVariationDescriptor,
} from "#lib/features/choreo-card/services/deck-variation.js";
import { processReversals } from "#lib/shared/create/services/reversal-detector.js";
import {
  flipSequence,
  mirrorSequence,
  rotateSequence,
  swapHands,
} from "#lib/shared/create/services/sequence-transformer.js";
import {
  updateSequenceData,
  type SequenceData,
} from "#lib/shared/foundation/domain/models/sequence-data.js";
import { deriveWord } from "#lib/shared/foundation/services/word-deriver.js";
import { stripWordNotation } from "#lib/shared/foundation/utils/word-notation.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { deriveTnDFromPictograph } from "#lib/shared/pictograph/shared/domain/utils/tnd-deriver.js";
import {
  MODE_FAMILY_ID,
  type VtgMode,
} from "#lib/shared/shape-matrix/services/shape-matrix-realizations.js";

export interface ModeLoop {
  readonly id: string;
  readonly word: string;
  readonly gridMode: GridMode;
  readonly sequence: SequenceData;
}

export type ModeLoopTransform =
  | "mirror"
  | "flip"
  | "rotate-clockwise"
  | "rotate-counterclockwise"
  | "swap";

interface LoopGroup {
  readonly gridMode: GridMode;
  readonly words: readonly string[];
}

/**
 * The four-count loops each mode guide offers, drawn from the canonical T&D
 * base pool. Each row is ordered pro-spin, anti-spin, then mixed. The same
 * letters can land in a different family on the other grid (DJDJ is
 * Together-Opposite on diamond and Quarter-Opposite on box), so every word is
 * listed with the grid that gives it this mode; selection verifies each step.
 */
const MODE_LOOP_GROUPS: Readonly<Record<VtgMode, readonly LoopGroup[]>> = {
  SS: [
    { gridMode: GridMode.DIAMOND, words: ["AAAA", "BBBB", "CCCC"] },
    { gridMode: GridMode.BOX, words: ["AAAA", "BBBB", "CCCC"] },
  ],
  TS: [
    { gridMode: GridMode.DIAMOND, words: ["GGGG", "HHHH", "IIII"] },
    { gridMode: GridMode.BOX, words: ["GGGG", "HHHH", "IIII"] },
  ],
  // Quarter-Same has two mixed loops, one for each hand leading pro.
  QS: [
    { gridMode: GridMode.DIAMOND, words: ["SSSS", "TTTT", "UUUU", "VVVV"] },
    { gridMode: GridMode.BOX, words: ["SSSS", "TTTT", "UUUU", "VVVV"] },
  ],
  SO: [
    { gridMode: GridMode.DIAMOND, words: ["JDJD", "KEKE", "LFLF"] },
    { gridMode: GridMode.BOX, words: ["PMPM", "QNQN", "RORO"] },
  ],
  TO: [
    { gridMode: GridMode.DIAMOND, words: ["DJDJ", "EKEK", "FLFL"] },
    { gridMode: GridMode.BOX, words: ["MPMP", "NQNQ", "OROR"] },
  ],
  QO: [
    { gridMode: GridMode.DIAMOND, words: ["MPMP", "NQNQ", "OROR"] },
    { gridMode: GridMode.BOX, words: ["DJDJ", "EKEK", "FLFL"] },
  ],
};

/** Loops per grid for a mode, known before any sequence data loads. */
export function modeLoopsPerGrid(code: VtgMode): number {
  return MODE_LOOP_GROUPS[code][0]!.words.length;
}

/** Total loops a mode guide offers. */
export function modeLoopCount(code: VtgMode): number {
  return MODE_LOOP_GROUPS[code].reduce(
    (total, group) => total + group.words.length,
    0
  );
}

export function selectModeLoops(
  code: VtgMode,
  sequences: readonly SequenceData[]
): ModeLoop[] {
  return MODE_LOOP_GROUPS[code].flatMap(({ gridMode, words }) =>
    words.map((word) => {
      const source = sequences.find(
        (sequence) => stripWordNotation(sequence.word) === word
      );
      if (!source)
        throw new Error(`The canonical ${word} sequence is unavailable.`);
      // The box versions change timing under rotation; the word alone cannot
      // establish which family the actual paths belong to.
      const sequence = applyBoxMode(
        source,
        gridMode === GridMode.BOX ? "box" : "diamond"
      );
      if (
        sequence.steps.length !== 4 ||
        !sequence.steps.every((step) => stepMode(step) === code)
      ) {
        throw new Error(`${word} does not contain four ${code} steps.`);
      }
      const id = `${code.toLowerCase()}-${gridMode}-${word.toLowerCase()}`;
      return {
        id,
        word,
        gridMode,
        sequence: processReversals(
          updateSequenceData(sequence, {
            id,
            gridMode,
            metadata: { ...sequence.metadata, familyId: MODE_FAMILY_ID[code] },
          })
        ),
      };
    })
  );
}

export async function loadModeLoops(code: VtgMode): Promise<ModeLoop[]> {
  const { loadCanonicalTnDBaseSequences } =
    await import("#lib/features/browse/gallery-home/canonical-tnd-pool.js");
  return selectModeLoops(code, await loadCanonicalTnDBaseSequences());
}

export async function adjustModeLoop(
  loop: ModeLoop,
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
      id: `${loop.id}-${crypto.randomUUID()}`,
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
export async function adjustModeLoops(
  loops: readonly ModeLoop[],
  leftTurns: number,
  rightTurns: number,
  stepIndex?: number
): Promise<ModeLoop[]> {
  return Promise.all(
    loops.map(async (loop) => {
      const sequence = await adjustModeLoop(
        loop,
        leftTurns,
        rightTurns,
        stepIndex
      );
      return { ...loop, sequence, word: sequence.word };
    })
  );
}

/** Apply one canonical geometric action to the actual sequence on a card. */
export async function transformModeLoop(
  loop: ModeLoop,
  transform: ModeLoopTransform
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

  const { familyId: _staleFamilyId, ...metadata } = transformed.metadata;
  const tndMode = stepMode(transformed.steps[0]!);
  const withWord = updateSequenceData(transformed, {
    id: `${loop.id}-${crypto.randomUUID()}`,
    word: deriveWord(transformed),
    metadata: {
      ...metadata,
      ...(tndMode ? { familyId: MODE_FAMILY_ID[tndMode] } : {}),
      turnLoopClosed: loopCloses(transformed),
    },
  });
  return processReversals(withWord);
}

/** Resolve one geometric action for every displayed card as one replacement deck. */
export async function transformModeLoops(
  loops: readonly ModeLoop[],
  transform: ModeLoopTransform
): Promise<ModeLoop[]> {
  return Promise.all(
    loops.map(async (loop) => {
      const sequence = await transformModeLoop(loop, transform);
      return {
        ...loop,
        sequence,
        word: sequence.word,
        gridMode: sequence.gridMode ?? loop.gridMode,
      };
    })
  );
}

// TnDMode's enum values are the same two-letter codes as VtgMode.
function stepMode(step: SequenceData["steps"][number]): VtgMode | null {
  return deriveTnDFromPictograph(step).tndMode as VtgMode | null;
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
