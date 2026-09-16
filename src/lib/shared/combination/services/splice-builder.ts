/**
 * Walk -> SequenceData: the pass that turns a graph object into something a
 * human can actually pick up two props and perform.
 *
 * The search guarantees PLACEMENT continuity — every block starts where the
 * previous one ended, and the walk returns to its own start seam. It guarantees
 * nothing about ORIENTATION, and it cannot: a block's entry orientation depends
 * on whatever now precedes it, which in a spliced walk is not what preceded it
 * on its own card. Card A's 4th step may have handed its H-block an `out` where
 * the H card's own cycle handed it an `in`.
 *
 * So the whole chain is re-derived here, from a single seed:
 *
 *   1. Flatten the blocks in walk order, renumbering 1..n.
 *   2. Rebuild the START PLACEMENT through `startPlacementDeriver` — the same
 *      derivation the sequence-hydrator uses. That hold IS the frame: its end
 *      orientations are the walk's only orientation input.
 *   3. `recalculateAllOrientations` — propagate from the hold through every
 *      step. THIS is the step that makes a mixed-source walk performable, and
 *      the reason a splice is more than a concatenation.
 *   4. `deriveSequenceLetters` — normalization, not correction. Dataframe rows
 *      carry no orientation (see `fixtures.test.ts` rowKey), so step 3 cannot
 *      change a letter; running the lookup anyway catches material that was
 *      never a real row in the first place, and flags it.
 *   5. `deriveReversals(..., { loop: true })` — reversal dots over the NEW step
 *      order, WITH the wrap. Splice seams are exactly where a prop-direction
 *      flip appears, which is what Austen's letter-faithful GG+HH examples show.
 *   6. Strict word + honest circularity + period (below).
 *
 * **isCircular is measured, not asserted.** A walk closes at the PLACEMENT level by
 * construction, but `isCircular` in this codebase means the app's stricter
 * seamless-loop definition — placement AND orientation return to the start, so a
 * player can repeat it with no visible jump (`isSeamlesslyLoopable`). Hard-coding
 * `true` would have lied about every result whose orientation chain takes two
 * passes.
 *
 * **`period` carries the fuller truth.** A walk whose orientations do not close
 * in one pass is not broken; it is a period-2 (or 4) loop, ordinary TKA. The
 * period is SIMULATED here — feed the last pass's end orientations back in as
 * the next pass's seed and count how many passes it takes to return — rather
 * than guessed, and orientation closure is never forced. Location closes in one
 * pass by construction, so for a combination `period` is exactly the orientation
 * period.
 *
 * **Arrow locations are not recomputed.** A step's arrow locations are a
 * function of its own two motions' locations plus its letter, and splicing
 * changes neither — only orientations, which arrow placement does not read. The
 * variant generator already normalized them when it built the material.
 *
 * Everything here is DETERMINISTIC: ids are derived from block index, step
 * index and the source step's own id, never minted. Two identical walks must
 * produce byte-identical sequences, or the search's determinism guarantee stops
 * at this boundary. (`startPlacementDeriver`'s own id, `derived-start-<placement>`,
 * is derived too — unlike `createStartPlacementFromBeatStart`, whose id is
 * `start-derived-${Date.now()}`.)
 */

import { deriveReversals } from "@tka/sequence-engine";

import {
  propagateOrientationsForHand,
  recalculateAllOrientations,
} from "$lib/shared/create/services/orientation-propagation";
import { reversalDetector } from "$lib/shared/create/services/reversal-detector";
import { deriveSequenceLetters } from "$lib/shared/create/services/sequence-transformer";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import {
  createSequenceData,
  updateSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { isSeamlesslyLoopable } from "$lib/shared/foundation/services/sequence-loopability-checker";
import { deriveWordStatus } from "$lib/shared/foundation/services/word-deriver";
import {
  HandSide,
  type Orientation,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { startPlacementDeriver } from "$lib/shared/pictograph/shared/services/start-placement-deriver";

import type { WalkBlock } from "../domain/types";

const HANDS = [HandSide.LEFT, HandSide.RIGHT] as const;

/**
 * Passes to simulate before giving up on orientation closure. The orientation
 * wheel has EIGHT states (`RADIAL_CW_CYCLE` in
 * `shared/render/core/calculations/orientation.ts`: in, clockIn, clock,
 * clockOut, out, counterOut, counter, counterIn), and each hand's per-pass map
 * is a rotation of it, so a two-hand period divides 8. This is the exact
 * ceiling, not headroom.
 */
const MAX_PERIOD = 8;

type OrientationSeed = Partial<Record<HandSide, Orientation>>;

/** Where each hand stands before the first step: the start hold's end state. */
function seedOf(sequence: SequenceData): OrientationSeed {
  const hold = sequence.startPlacement;
  if (!hold) return {};
  return Object.fromEntries(
    HANDS.map((hand) => [hand, hold.motions[hand]?.endOrientation])
  ) as OrientationSeed;
}

/**
 * One pass of the sequence: what each hand's orientation becomes after playing
 * every step once from `seed`.
 *
 * Reuses the same propagation the orientation recalc uses, so a simulated pass
 * and a real one can never disagree.
 */
function playOnePass(
  steps: readonly StepData[],
  seed: OrientationSeed
): OrientationSeed {
  const next: OrientationSeed = {};
  for (const hand of HANDS) {
    const start = seed[hand];
    if (start === undefined) continue;
    const played = propagateOrientationsForHand([...steps], hand, start);
    next[hand] = played.at(-1)?.motions[hand]?.endOrientation ?? start;
  }
  return next;
}

function sameSeed(a: OrientationSeed, b: OrientationSeed): boolean {
  return HANDS.every((hand) => a[hand] === b[hand]);
}

/**
 * Passes required to return to the starting orientation — the sequence's
 * `period`.
 *
 * 1 = closes in one pass (a true seamless loop). 2 = halved: play it twice and
 * the props are back where they began. Both are correct sequences; only the
 * player's repeat count differs.
 *
 * Returns undefined when the chain has not closed within {@link MAX_PERIOD}
 * passes. At 0 turns that should be unreachable, so it warns rather than
 * silently reporting a number it cannot justify.
 */
function orientationPeriod(
  sequence: SequenceData
): { period: number } | undefined {
  const seed = seedOf(sequence);
  if (sequence.steps.length === 0 || Object.keys(seed).length === 0) {
    return undefined;
  }

  let current = seed;
  for (let pass = 1; pass <= MAX_PERIOD; pass++) {
    current = playOnePass(sequence.steps, current);
    if (sameSeed(current, seed)) return { period: pass };
  }

  console.warn(
    `[splice-builder] orientation chain of ${sequence.id} did not close within ${MAX_PERIOD} passes; ` +
      "leaving period unset rather than reporting an unjustified number."
  );
  return undefined;
}

/**
 * Re-derive every step's letter from its own motions.
 *
 * Mirrors `variant-generator`'s `withDerivedLetters`: `deriveSequenceLetters`
 * KEEPS the existing letter when a lookup fails, so a surviving null means the
 * spliced material is not a dataframe row — worth saying out loud rather than
 * carrying silently into a word.
 */
async function withDerivedLetters(seq: SequenceData): Promise<SequenceData> {
  let derived: SequenceData;
  try {
    derived = await deriveSequenceLetters(seq);
  } catch (error) {
    // The dataframe is unavailable (no CSV, no IndexedDB). Letters are
    // orientation-independent, so the carried-through ones are still correct —
    // degrade to them rather than losing the whole splice.
    console.warn(
      "[splice-builder] letter derivation unavailable; keeping carried letters",
      error
    );
    return seq;
  }

  const unresolved = derived.steps.filter((step) => step.letter === null);
  if (unresolved.length > 0) {
    console.warn(
      `[splice-builder] ${unresolved.length} of ${derived.steps.length} spliced steps have no dataframe letter ` +
        `(steps ${unresolved.map((s) => s.stepNumber).join(", ")}); the result is flagged metadata.incompleteWord.`
    );
  }
  return derived;
}

/**
 * Reversal dots over the spliced step order, WITH the loop wrap.
 *
 * `reversalDetector.processReversals` gates the wrap on `sequence.loopType`,
 * which a combination does not carry — its LOOP classification is not this
 * layer's claim to make. But a closed walk IS cyclic by construction, so step 1
 * genuinely does look back at the last step, and suppressing that would hide a
 * real dot at the wrap seam. The engine detector is called directly with
 * `loop: true`; the app's display policy (dots = the `propReversal` channel
 * only) and its per-step applier are still the adapter's.
 */
function withWrapReversals(seq: SequenceData): SequenceData {
  const flags = deriveReversals(seq.steps, { loop: true });
  return updateSequenceData(seq, {
    steps: seq.steps.map((step, i) =>
      reversalDetector.applyReversalSymbols(step, {
        leftReversal: flags[i]?.left.propReversal ?? false,
        rightReversal: flags[i]?.right.propReversal ?? false,
      })
    ),
  });
}

/**
 * Assemble a closed walk's blocks into a performable SequenceData.
 *
 * `frameCard` is the card the combination is expressed in — card A. Its grid
 * mode is carried onto the result; its start placement is NOT, because a walk
 * may enter card A at any step and the hold has to match the step the walk
 * actually begins on.
 *
 * Throws on an empty walk. The search never emits one (a recorded walk has at
 * least two steps), so an empty block list is a caller bug, and a
 * stepless "sequence" would be a silently useless object.
 */
export async function buildResult(
  blocks: readonly WalkBlock[],
  frameCard: SequenceData
): Promise<SequenceData> {
  const steps: StepData[] = [];
  blocks.forEach((block, blockIndex) => {
    block.steps.forEach((step, stepIndex) => {
      const stepNumber = steps.length + 1;
      steps.push(
        createStepData({
          ...step,
          // Block index + step index + the source step's own id. Derived, never
          // minted: `crypto.randomUUID()` here would make two runs of the same
          // search produce different sequences.
          id: `${blockIndex}.${stepIndex}:${block.sourceId}:${step.id}`,
          stepNumber,
          // Belt and braces: the source flags describe adjacency in the SOURCE
          // ordering, and the splice has a new one. `withWrapReversals` below
          // is authoritative and overwrites both.
          leftReversal: false,
          rightReversal: false,
        })
      );
    });
  });

  const first = steps[0];
  if (!first) {
    throw new Error(
      "buildResult: a walk with no steps is not a sequence (the search never emits one)"
    );
  }

  const id = `combination:${blocks
    .map((b) => `${b.sourceId}#${b.startStepIndex}+${b.steps.length}`)
    .join("|")}`;

  const spliced = createSequenceData({
    id,
    steps,
    // Provisional; measured at the end, once orientations are real.
    isCircular: false,
    ...(frameCard.gridMode !== undefined && { gridMode: frameCard.gridMode }),
    startPlacement: startPlacementDeriver.deriveFromFirstStep(first),
  });

  // 3 → 4 → 5. Order matters only between 3 and 5: reversal flags are read off
  // the final step order, and nothing after 3 reorders anything.
  const oriented = recalculateAllOrientations(spliced);
  const lettered = await withDerivedLetters(oriented);
  const result = withWrapReversals(lettered);

  // Strict derivation, not the permissive display helper: `deriveWord` drops
  // unlettered steps and falls back to `name`, which would turn an 8-step walk
  // with one unresolved step into a plausible 7-token word. The partial word is
  // still emitted (it is the honest best label), but `incompleteWord` makes the
  // gap VISIBLE to the classifier and to anything that would save or mint a
  // shortcode from it — both of which must refuse.
  const status = deriveWordStatus(result);
  const closure = orientationPeriod(result);

  return updateSequenceData(result, {
    word: status.word,
    // Display simplification (FΨFΨ -> FΨ) is word-simplifier's job at the
    // display layer; `word` and `name` are the data layer's full expansion.
    name: status.word || "combination",
    isCircular: isSeamlesslyLoopable(result),
    ...(closure && { period: closure.period }),
    ...(!status.complete && {
      metadata: { ...result.metadata, incompleteWord: true },
    }),
  });
}
