/**
 * Reversal Transform Apply (firebase-free)
 *
 * The pure transform half of the reversal seed service: clone + flip a base
 * sequence into its reversal variant (`transformSequence`), and the idempotent
 * absolute-target apply (`applyReversalMatrix`) with its `solveHandFlips` solver.
 * Split out of `reversal-seed-service.ts` so the deck variation engine and the
 * firebase-free landing hero pool can import these without pulling the Firestore
 * seeder (and its `$lib/shared/auth/firebase` side effects) into their bundle.
 *
 * `reversal-seed-service.ts` re-exports everything here for backward compatibility.
 */

import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { lookupLetter, type CsvEdge } from "./pictograph-letter-lookup";
import {
  getReversalFlagsForBeat,
  applyReversalToMotion,
  cumulativeParities,
  type ResolvedReversalPattern,
} from "../domain/reversal-transform";
import { recalculateAllOrientations } from "$lib/shared/create/services/orientation-propagation";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { updateSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { Letter } from "$lib/shared/foundation/domain/models/letter";

/** A plain, mutable working copy of a single motion during transform. */
export interface MutableMotion {
  motionType?: string;
  rotationDirection?: string;
  startLocation?: string;
  endLocation?: string;
  isVisible?: boolean;
  [key: string]: unknown;
}

/**
 * Flip a single motion in place when its hand is reversed:
 *   - motionType pro↔anti (static/dash unchanged — delegated to the domain helper)
 *   - rotationDirection cw↔ccw (noRotation / undefined unchanged)
 */
function flipMotion(
  motion: MutableMotion | undefined,
  reversed: boolean
): void {
  if (!motion || !reversed) return;
  if (typeof motion.motionType === "string") {
    motion.motionType = applyReversalToMotion(motion.motionType, true);
  }
  if (motion.rotationDirection === "cw") motion.rotationDirection = "ccw";
  else if (motion.rotationDirection === "ccw") motion.rotationDirection = "cw";
}

/**
 * Clone + transform a single base sequence into its reversal variant.
 *
 * The clone is a deep JSON copy: this strips class prototypes and `undefined`
 * fields (both of which Firestore rejects) and yields plain mutable objects
 * that we can transform without violating the readonly domain types.
 */
export function transformSequence(
  seq: SequenceData,
  pattern: ResolvedReversalPattern,
  edges: CsvEdge[]
): SequenceData {
  const clone = JSON.parse(JSON.stringify(seq)) as SequenceData;
  const steps = (clone.steps ?? []) as readonly StepData[];

  // Reversal is CUMULATIVE (matching reversal-detector.ts: a step reverses when
  // its spin differs from the previous step). The pattern symbol TOGGLES a running
  // per-hand parity; a step's motion is flipped from base whenever parity is true.
  // The stored reversal flag marks the toggle step (the spin-change), which is what
  // the detector re-derives. Absolute per-step flipping made PPPP uniform-anti,
  // which the detector reads back as "continuous" — the bug this replaces.
  const parities = cumulativeParities(pattern.sequence, steps.length);
  const transformedSteps = steps.map((step, stepIndex) => {
    const { leftReversal: leftToggle, rightReversal: rightToggle } =
      getReversalFlagsForBeat(pattern.sequence, stepIndex);
    const leftParity = parities.left[stepIndex] ?? false;
    const rightParity = parities.right[stepIndex] ?? false;

    const mutable = step as unknown as {
      motions?: { left?: MutableMotion; right?: MutableMotion };
      startPlacement?: string | null;
      endPlacement?: string | null;
      letter?: string | null;
      leftReversal?: boolean;
      rightReversal?: boolean;
    };

    const left = mutable.motions?.left;
    const right = mutable.motions?.right;

    flipMotion(left, leftParity);
    flipMotion(right, rightParity);
    mutable.leftReversal = leftToggle;
    mutable.rightReversal = rightToggle;

    // Re-derive the letter from the CSV. Match is on placements + motionType +
    // locations only (NOT rotationDirection) — consistent with the reference.
    // Invisible placeholder = hand not really there (both-required Step shape).
    if (isVisibleMotion(left) && isVisibleMotion(right)) {
      const letter = lookupLetter(edges, {
        startPlacement: String(mutable.startPlacement ?? ""),
        endPlacement: String(mutable.endPlacement ?? ""),
        left: {
          motionType: String(left.motionType ?? ""),
          startLocation: String(left.startLocation ?? ""),
          endLocation: String(left.endLocation ?? ""),
        },
        right: {
          motionType: String(right.motionType ?? ""),
          startLocation: String(right.startLocation ?? ""),
          endLocation: String(right.endLocation ?? ""),
        },
      });
      if (letter) mutable.letter = letter;
    }

    return step;
  });

  // Recompute the orientation chain from the start placement baseline. The flip
  // changed motionType/rotationDirection, so end orientations cascade.
  const withSteps = updateSequenceData(clone, { steps: transformedSteps });
  const reoriented = recalculateAllOrientations(withSteps);

  // Recompute the displayed word from the new letters.
  const word = reoriented.steps
    .map((s) => (s.letter as Letter | null | undefined) ?? "")
    .join("");

  return updateSequenceData(reoriented, {
    word,
    name: word,
    // `reversalPattern` is not part of SequenceData's typed surface; it travels
    // through to Firestore for parity with the reference deck/sequence shape.
    ...({ reversalPattern: pattern.id } as Partial<SequenceData>),
  });
}

type Spin = "cw" | "ccw";

/** A motion's spin, or null when it isn't spinning (static / dash / no dir). */
function spinOf(motion: MutableMotion | undefined): Spin | null {
  if (!motion) return null;
  if (motion.rotationDirection === "cw") return "cw";
  if (motion.rotationDirection === "ccw") return "ccw";
  return null;
}

/**
 * Solve which steps of one hand must flip so that the *detected* reversals of
 * the result land exactly on the caller's `desired` cells.
 *
 * A reversal is "this step's spin differs from the previous spinning step"
 * (matching `reversal-detector.ts`). So we walk the hand's spinning steps in
 * order, anchor the first to its current spin, and set every later step's target
 * spin to flip-from-previous iff its cell is on. A step flips only when its
 * current spin already disagrees with that target — which makes a second apply
 * of the same matrix a no-op (idempotent) and the rendered dots match the matrix
 * 1:1 (WYSIWYG).
 *
 * Non-spinning steps (static / dash) can't carry a reversal, so their cells are
 * inert. The first spinning step's cell is honoured on a loop via the wrap (when
 * the hand reverses an even number of times the loop closes and the wrap
 * reversal falls out automatically); on a non-loop it has no predecessor and is
 * inert, exactly as the detector reports.
 */
export function solveHandFlips(
  motions: (MutableMotion | undefined)[],
  desired: boolean[]
): boolean[] {
  const len = motions.length;
  const flips = new Array<boolean>(len).fill(false);

  let firstSpin = -1;
  for (let i = 0; i < len; i++) {
    if (spinOf(motions[i])) {
      firstSpin = i;
      break;
    }
  }
  if (firstSpin < 0) return flips; // hand never spins → nothing to reverse

  // Anchor the first spinning step to its current spin (flips[firstSpin] = false).
  let target: Spin = spinOf(motions[firstSpin])!;
  for (let i = firstSpin + 1; i < len; i++) {
    const base = spinOf(motions[i]);
    if (!base) continue; // non-spinning step: inert cell
    if (desired[i]) target = target === "cw" ? "ccw" : "cw";
    flips[i] = base !== target;
  }
  return flips;
}

/**
 * Apply a reversal matrix to a live sequence, idempotently.
 *
 * `leftReversals` / `rightReversals` are per-step "reverse here" flags (already
 * tiled to the sequence length). Unlike {@link transformSequence} (which toggles
 * relative to the current motions and is therefore designed to run once on a
 * clean catalog base), this solves for an absolute target spin and flips only
 * the delta — so re-applying the same matrix changes nothing, and the reversal
 * dots the detector renders match the matrix exactly.
 *
 * Reuses the proven flip → re-derive-letter → recompute-orientation pipeline.
 */
export function applyReversalMatrix(
  seq: SequenceData,
  leftReversals: boolean[],
  rightReversals: boolean[],
  edges: CsvEdge[]
): SequenceData {
  const clone = JSON.parse(JSON.stringify(seq)) as SequenceData;
  const steps = (clone.steps ?? []) as readonly StepData[];

  const leftMotions = steps.map(
    (s) =>
      (s as unknown as { motions?: { left?: MutableMotion } }).motions?.left
  );
  const rightMotions = steps.map(
    (s) =>
      (s as unknown as { motions?: { right?: MutableMotion } }).motions?.right
  );

  const leftFlips = solveHandFlips(leftMotions, leftReversals);
  const rightFlips = solveHandFlips(rightMotions, rightReversals);

  const transformedSteps = steps.map((step, stepIndex) => {
    const mutable = step as unknown as {
      motions?: { left?: MutableMotion; right?: MutableMotion };
      startPlacement?: string | null;
      endPlacement?: string | null;
      letter?: string | null;
      leftReversal?: boolean;
      rightReversal?: boolean;
    };

    const left = mutable.motions?.left;
    const right = mutable.motions?.right;

    flipMotion(left, leftFlips[stepIndex] ?? false);
    flipMotion(right, rightFlips[stepIndex] ?? false);
    mutable.leftReversal = leftReversals[stepIndex] ?? false;
    mutable.rightReversal = rightReversals[stepIndex] ?? false;

    if (left && right) {
      const letter = lookupLetter(edges, {
        startPlacement: String(mutable.startPlacement ?? ""),
        endPlacement: String(mutable.endPlacement ?? ""),
        left: {
          motionType: String(left.motionType ?? ""),
          startLocation: String(left.startLocation ?? ""),
          endLocation: String(left.endLocation ?? ""),
        },
        right: {
          motionType: String(right.motionType ?? ""),
          startLocation: String(right.startLocation ?? ""),
          endLocation: String(right.endLocation ?? ""),
        },
      });
      if (letter) mutable.letter = letter;
    }

    return step;
  });

  const withSteps = updateSequenceData(clone, { steps: transformedSteps });
  const reoriented = recalculateAllOrientations(withSteps);

  const word = reoriented.steps
    .map((s) => (s.letter as Letter | null | undefined) ?? "")
    .join("");

  return updateSequenceData(reoriented, { word, name: word });
}
