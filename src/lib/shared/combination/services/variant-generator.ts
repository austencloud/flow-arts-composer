/**
 * Variant generator — every re-orientation of a card the combination search is
 * allowed to try.
 *
 * Two independent axes:
 *
 *  1. **Spatial / hand role** — rotation (even 45° steps only, so grid mode is
 *     preserved), vertical mirror, and left↔right swap. These reuse the create
 *     module's transform pipeline verbatim (`rotateSequence`, `mirrorSequence`,
 *     `swapHands`).
 *  2. **The rotation-faithful twin** — see {@link buildRotationFaithfulTwin}.
 *
 * Full liberties enumerate 4 x 2 x 2 x 2 = 32 candidates, twin applied LAST so
 * it operates on the already-transformed material. The emitted list is SMALLER
 * than that: cyclically-identical candidates are collapsed to one source (see
 * {@link cyclicCanonicalSignature}) — a card whose four rotations are the same
 * loop phase-shifted would otherwise flood the walk search with duplicates.
 *
 * **Letter invariance.** The spatial/hand-role transforms are letter-preserving:
 * hand swap, vertical mirror and 90° rotation each map every diamond row to
 * another diamond row with the SAME letter (verified 649/649 diamond and
 * 650/650 box rows), which is why the non-twin path never calls the async
 * letter derivation. Only the twin re-derives, because reversing the traversal
 * genuinely changes the letter (G-run becomes H-run).
 *
 * **`word` is the data layer.** Every emitted variant normalizes `word` to the
 * full expanded letter string of its own steps — including the identity
 * variant, whose incoming `word` may be a stale or hand-authored label.
 * Collapsing a repeated word for humans is `word-simplifier`'s job at the
 * display layer, never this module's.
 */

import {
  deriveSequenceLetters,
  mirrorSequence,
  rotateSequence,
  swapHands,
} from "$lib/shared/create/services/sequence-transformer";
import { createStartPlacementFromBeatStart } from "$lib/shared/create/services/sequence-transforms";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import {
  updateSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { deriveWordFromBeats } from "$lib/shared/foundation/services/word-deriver";
import { arrowLocationCalculator } from "$lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator";
import type { HandPath } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  HandSide,
  type MotionType,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  createMotionData,
  type MotionData,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  deriveMotionType,
  getHandpathDirection,
} from "$lib/shared/render/core/calculations/orientation";

import type { VariantDescriptor, WalkSource } from "../domain/types";

/** Even 45°-steps only — odd amounts toggle diamond<->box. */
const ROTATIONS: readonly (0 | 2 | 4 | 6)[] = [0, 2, 4, 6];

const HANDS = [HandSide.LEFT, HandSide.RIGHT] as const;

export interface VariantLiberties {
  readonly allowMirror: boolean;
  readonly allowRotation: boolean;
  readonly allowHandSwap: boolean;
  readonly exploreRotationFaithful: boolean;
}

/** Which side of the combination these sources belong to, and how they're labelled. */
export interface VariantSourceOptions {
  /** Defaults to "cardB". Card A's own twin uses "cardA". */
  readonly kind?: "cardA" | "cardB";
  /** Defaults to "B" — the leading token of every emitted source id. */
  readonly labelPrefix?: string;
}

/** "id", "r2", "mirror+swap", "r6+mirror+swap+twin" — injective, deterministic. */
function describeVariant(variant: VariantDescriptor): string {
  const parts = [
    variant.rotation ? `r${variant.rotation}` : "",
    variant.mirrored ? "mirror" : "",
    variant.handsSwapped ? "swap" : "",
    variant.rotationFaithful ? "twin" : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("+") : "id";
}

// ---------------------------------------------------------------------------
// Derived-field normalization
// ---------------------------------------------------------------------------

/**
 * `handPath` and `prefloat*` are cached derivations of the hand path, and NONE
 * of the create-module transforms maintain them: `mirrorMotion` flips
 * `rotationDirection` but leaves `prefloatRotationDirection` alone, and neither
 * it nor `rotateMotion` touches `handPath` at all. Carried forward unchanged
 * they describe a path the motion no longer takes.
 *
 * `prefloatRotationDirectionIsTrusted` is false exactly when the transform
 * chain flipped `rotationDirection` without flipping its prefloat twin (i.e.
 * after a mirror). In that case both prefloat fields are BLANKED rather than
 * recomputed: `motion-query-handler` PREFERS `prefloatMotionType` when present,
 * so a stale value is confidently wrong, while a missing one lets the lookup
 * try both possibilities.
 *
 * Note `deriveMotionType` only ever returns "float" for `turns === "fl"` — the
 * prefloat pair is what records the motion a float would otherwise have been,
 * and it is derived from `prefloatRotationDirection`, never from `turns`.
 */
function normalizeMotionDerivations(
  motion: MotionData,
  prefloatRotationDirectionIsTrusted: boolean
): MotionData {
  const canRecomputePrefloat =
    motion.prefloatMotionType !== undefined &&
    motion.prefloatRotationDirection !== undefined &&
    prefloatRotationDirectionIsTrusted;

  return createMotionData({
    ...motion,
    // Only motions that already carry a hand path get one back; a null stays
    // null rather than gaining data the source never had.
    ...(motion.handPath != null && {
      handPath: getHandpathDirection(
        motion.startLocation,
        motion.endLocation
      ) as HandPath,
    }),
    ...(motion.prefloatMotionType !== undefined &&
      (canRecomputePrefloat
        ? {
            prefloatMotionType: deriveMotionType(
              motion.startLocation,
              motion.endLocation,
              motion.prefloatRotationDirection!,
              0
            ) as MotionType,
          }
        : {
            prefloatMotionType: undefined,
            prefloatRotationDirection: undefined,
          })),
  });
}

/**
 * Recompute the arrow locations of a step through the canonical calculator.
 *
 * A DASH's arrow location depends on the OTHER hand AND on the step's LETTER
 * (letter type drives the Type-3 shift branch; Φ-/Ψ- have their own map), so
 * this cannot be done per-motion and must run AFTER letter derivation. Same
 * seam the fixtures use; called directly rather than through `assemble-lab`'s
 * `withCalculatedArrowLocations` wrapper because `shared/` must not import from
 * `features/`.
 */
function withArrowLocations(step: StepData): StepData {
  return createStepData({
    ...step,
    motions: {
      [HandSide.LEFT]: createMotionData({
        ...step.motions.left,
        arrowLocation: arrowLocationCalculator.calculateLocation(
          step.motions.left,
          step
        ),
      }),
      [HandSide.RIGHT]: createMotionData({
        ...step.motions.right,
        arrowLocation: arrowLocationCalculator.calculateLocation(
          step.motions.right,
          step
        ),
      }),
    },
  });
}

/** Every derived field of a step, recomputed from its own final motions. */
function normalizeStep(
  step: StepData,
  prefloatRotationDirectionIsTrusted: boolean
): StepData {
  return withArrowLocations(
    createStepData({
      ...step,
      motions: {
        [HandSide.LEFT]: normalizeMotionDerivations(
          step.motions.left,
          prefloatRotationDirectionIsTrusted
        ),
        [HandSide.RIGHT]: normalizeMotionDerivations(
          step.motions.right,
          prefloatRotationDirectionIsTrusted
        ),
      },
    })
  );
}

function normalizeSequence(
  seq: SequenceData,
  prefloatRotationDirectionIsTrusted: boolean
): SequenceData {
  return updateSequenceData(seq, {
    steps: seq.steps.map((step) =>
      normalizeStep(step, prefloatRotationDirectionIsTrusted)
    ),
  });
}

// ---------------------------------------------------------------------------
// The rotation-faithful twin
// ---------------------------------------------------------------------------

/**
 * One motion, traversed backwards with its prop rotation untouched.
 *
 * `motionType` is NOT carried over — it is a FUNCTION of (hand path, rotation
 * direction, turns), which is exactly what `deriveMotionType` computes. Holding
 * the rotation while reversing the path is what flips PRO<->ANTI. DASH stays
 * DASH and STATIC stays STATIC by the same function (their hand paths have no
 * orbital direction, so rotation direction never enters the classification).
 *
 * Orientations are swapped as a provisional value only: the true chain is
 * re-derived downstream (`recalculateAllOrientations` in the splice-builder),
 * because the entry orientation of a spliced block depends on what precedes it.
 */
function reverseMotion(motion: MotionData): MotionData {
  const startLocation = motion.endLocation;
  const endLocation = motion.startLocation;

  const motionType = deriveMotionType(
    startLocation,
    endLocation,
    motion.rotationDirection,
    motion.turns
  ) as MotionType;

  return createMotionData({
    ...motion,
    motionType,
    startLocation,
    endLocation,
    startOrientation: motion.endOrientation,
    endOrientation: motion.startOrientation,
  });
}

/** One step, traversed backwards. Letter is blanked for re-derivation. */
function reverseStep(step: StepData, stepNumber: number): StepData {
  return createStepData({
    ...step,
    id: `${step.id}~twin`,
    stepNumber,
    startPlacement: step.endPlacement,
    endPlacement: step.startPlacement,
    // A carried-over letter would be a lie (a G on an anti step). Null after
    // derivation means the reversed configuration is not a dataframe row.
    letter: null,
    motions: {
      [HandSide.LEFT]: reverseMotion(step.motions.left),
      [HandSide.RIGHT]: reverseMotion(step.motions.right),
    },
    // Reversal flags describe adjacency in the OLD ordering.
    leftReversal: false,
    rightReversal: false,
  });
}

/**
 * The rotation-faithful twin: the same card traversed backwards while every
 * prop keeps rotating the way it already was.
 *
 * This models Austen's FLGGFLHH card — the prop rotation flows continuously
 * while the hand path reverses, and the G-run reads as an H-run as a
 * consequence. Concretely: reverse the step order, swap each step's start/end
 * placement, swap each motion's start/end location and orientation, KEEP each
 * motion's `rotationDirection`, then re-derive `motionType` and the letters.
 *
 * Proven against the fixtures: `buildRotationFaithfulTwin(GGGG_CW)`
 * (beta1->3->5->7, pro + cw) reproduces `HHHH_CW` (beta1->7->5->3, anti + cw),
 * which is a transcribed, dataframe-verified card of Austen's.
 *
 * It is NOT the LOOP "inverted" component: `invertMotion`
 * (create/services/motion-transforms.ts) flips motion type AND rotation
 * direction in place, which keeps the hand path — a different transform.
 * Flipping only the type while holding both rotation and locations is
 * impossible: that pair of rows does not exist in the dataframe.
 *
 * Involution: applying it twice restores the original placements, locations,
 * rotations, orientations and step numbers.
 */
export async function buildRotationFaithfulTwin(
  seq: SequenceData
): Promise<SequenceData> {
  const reversed = updateSequenceData(seq, {
    steps: [...seq.steps]
      .reverse()
      .map((step, index) => reverseStep(step, index + 1)),
  });

  // Letters first: a DASH's arrow location reads the step's letter, so the
  // normalization pass has to run after derivation, not before.
  const lettered = await withDerivedLetters(reversed);
  // Reversal preserves `rotationDirection`, so the prefloat pair stays coherent.
  const twin = normalizeSequence(lettered, true);

  const first = twin.steps[0];
  const hold = first ? createStartPlacementFromBeatStart(first) : undefined;

  return updateSequenceData(twin, {
    word: deriveWordFromBeats(twin.steps),
    ...(hold && { startPlacement: hold }),
    ...(hold &&
      seq.startingPlacement !== undefined && {
        startingPlacement: hold,
      }),
  });
}

/**
 * Re-derive every step's letter from its motions. Used by the twin ONLY — the
 * spatial/hand-role transforms are letter-invariant, so paying for an async
 * dataframe lookup on that path would be a no-op.
 *
 * `deriveSequenceLetters` keeps the existing letter when a lookup fails, and
 * the twin blanks its letters first, so a surviving null is a genuine miss and
 * is worth saying out loud.
 */
async function withDerivedLetters(seq: SequenceData): Promise<SequenceData> {
  const derived = await deriveSequenceLetters(seq);
  const unresolved = derived.steps.filter((step) => step.letter === null);
  if (unresolved.length > 0) {
    console.warn(
      `[variant-generator] ${unresolved.length} of ${derived.steps.length} twin steps have no dataframe letter ` +
        `(steps ${unresolved.map((s) => s.stepNumber).join(", ")}); the walk search will carry them unlettered.`
    );
  }
  return derived;
}

// ---------------------------------------------------------------------------
// Identity + deduplication
// ---------------------------------------------------------------------------

/**
 * Stamp a variant sequence with its own identity.
 *
 * `displayName` and `intendedWord` are DELETED, not overwritten:
 * `getSequenceDisplayName` prioritizes them over `word`, so a carried-over
 * display name would render the twin of "FALG" as "FALG" everywhere in the UI.
 *
 * The name pairs the variant's OWN word with its label ("HFBLHFBL twin"). A
 * bare label is not a name — a sequence called "id" or "twin" tells a reader
 * nothing about what it is.
 */
function stampIdentity(
  seq: SequenceData,
  sourceCardId: string,
  label: string
): SequenceData {
  const word = deriveWordFromBeats(seq.steps);
  const stamped = {
    ...seq,
    id: `${sourceCardId}~${label}`,
    name: `${word} ${label}`.trim(),
    word,
  } as SequenceData & { displayName?: string; intendedWord?: string };
  delete stamped.displayName;
  delete stamped.intendedWord;
  return stamped;
}

/** Letter + placements + per-hand locations, rotations and motion types. */
function stepSignature(step: StepData): string {
  return [
    step.letter ?? "-",
    step.startPlacement ?? "-",
    step.endPlacement ?? "-",
    ...HANDS.map((hand) => {
      const m = step.motions[hand];
      return `${hand}:${m.motionType}:${m.rotationDirection}:${m.startLocation}>${m.endLocation}`;
    }),
  ].join("/");
}

/**
 * The lexicographically-smallest rotation of the step signatures — equal for
 * two variants iff they are the SAME cyclic loop entered at a different step.
 *
 * This is what collapses a symmetric card's four rotations (GGGG's r2 is just
 * GGGG started one step later) into a single source. Orientations are excluded
 * deliberately: they are re-derived at splice time, so two otherwise-identical
 * loops differing only in their provisional entry orientation are the same
 * material to the walk search.
 */
function cyclicCanonicalSignature(seq: SequenceData): string {
  const keys = seq.steps.map(stepSignature);
  const n = keys.length;
  if (n === 0) return "";
  let best = keys.join("|");
  for (let k = 1; k < n; k++) {
    const rotated = [...keys.slice(k), ...keys.slice(0, k)].join("|");
    if (rotated < best) best = rotated;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

/**
 * Every DISTINCT source for a card under the given liberties.
 *
 * Enumeration order is fixed — rotation ascending, then no-mirror, then
 * no-swap, then no-twin — which is exactly the "simplest descriptor" priority
 * the dedup wants, so keeping the first member of each cyclic-equivalence class
 * keeps the preferred one. Fully deterministic across runs.
 *
 * Measured collapse on the fixture corpus: GGGG_CW 32 candidates -> 4 sources
 * (all four rotations are one loop, and its two hands are identical so hand
 * swap is a no-op); FALG 32 -> 16 (its halves exchange hand roles).
 */
export async function buildVariants(
  card: SequenceData,
  liberties: VariantLiberties,
  options: VariantSourceOptions = {}
): Promise<WalkSource[]> {
  const kind = options.kind ?? "cardB";
  const labelPrefix = options.labelPrefix ?? "B";

  const rotations = liberties.allowRotation ? ROTATIONS : ([0] as const);
  const mirrors = liberties.allowMirror ? [false, true] : [false];
  const handSwaps = liberties.allowHandSwap ? [false, true] : [false];
  const twins = liberties.exploreRotationFaithful ? [false, true] : [false];

  const sources: WalkSource[] = [];
  const seen = new Set<string>();

  for (const rotation of rotations) {
    const rotated = rotation ? await rotateSequence(card, rotation) : card;

    for (const mirrored of mirrors) {
      const spatial = mirrored ? await mirrorSequence(rotated) : rotated;

      for (const handsSwapped of handSwaps) {
        const handAdjusted = handsSwapped ? swapHands(spatial) : spatial;
        // A mirror flipped rotationDirection without flipping its prefloat
        // twin, so prefloat can no longer be trusted on this branch.
        const base = normalizeSequence(handAdjusted, !mirrored);

        for (const rotationFaithful of twins) {
          const variant: VariantDescriptor = {
            rotation,
            mirrored,
            handsSwapped,
            rotationFaithful,
          };
          const sequence = rotationFaithful
            ? await buildRotationFaithfulTwin(base)
            : base;

          const signature = cyclicCanonicalSignature(sequence);
          if (seen.has(signature)) continue;
          seen.add(signature);

          const label = describeVariant(variant);
          sources.push({
            kind,
            id: `${labelPrefix} ${label}`,
            variant,
            sequence: stampIdentity(sequence, card.id, label),
          });
        }
      }
    }
  }

  return sources;
}

/**
 * Just the rotation-faithful twin of a card, as a ready-to-walk source.
 *
 * Card A is never rotated, mirrored, or hand-swapped (it is the frame the
 * combination is expressed in), but its twin IS admissible material — this is
 * the one-call way for the walk search to get it without re-deriving the
 * source-construction rules.
 */
export async function buildTwinSource(
  card: SequenceData,
  kind: "cardA" | "cardB" = "cardA",
  labelPrefix = "A"
): Promise<WalkSource> {
  const variant: VariantDescriptor = {
    rotation: 0,
    mirrored: false,
    handsSwapped: false,
    rotationFaithful: true,
  };
  const label = describeVariant(variant);
  const twin = await buildRotationFaithfulTwin(normalizeSequence(card, true));
  return {
    kind,
    id: `${labelPrefix} ${label}`,
    variant,
    sequence: stampIdentity(twin, card.id, label),
  };
}
