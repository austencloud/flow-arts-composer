/**
 * reversal-detector.ts
 *
 * App adapter over THE canonical reversal detector, `deriveReversals` in
 * `@tka/sequence-engine`. This module keeps the app-facing API (SequenceData
 * in, StepData out, option-preview helpers) and delegates detection
 * semantics — loop wrap, transparent blank/noRotation chains — to the engine.
 *
 * DISPLAY POLICY (Austen, 2026-07-05): the pictograph reversal DOTS are for
 * prop-direction reversals ONLY. This adapter therefore consumes the engine's
 * `propReversal` channel exclusively — a dot appears iff the prop's rotation
 * direction flips (which covers prop reversals AND full reversals; both flip
 * prop direction). Byte-identical to the legacy rotation-only detector over
 * the published corpus (proven in tests/unit/hand-arc-reversal-impact.test.ts).
 *
 * The engine's `handReversal` channel (hand retraces its arc, prop continues
 * — MCP hand-reversal type) is deliberately NOT read here. It is a separate,
 * non-display signal retained for future consumers (e.g. the practice
 * judgment loop).
 */

import { deriveReversals } from "@tka/sequence-engine";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import { getEffectiveRotationDirection } from "#lib/shared/pictograph/shared/domain/utils/effective-rotation-direction.js";

/**
 * Reversal Detection Service Contract
 */
export interface ReversalInfo {
  leftReversal: boolean;
  rightReversal: boolean;
}

export interface PictographWithReversals extends PictographData {
  leftReversal: boolean;
  rightReversal: boolean;
}

/**
 * Process reversals for an entire sequence.
 *
 * For loop sequences (rotated, mirrored, etc.) the last steps wrap into the
 * first steps, so step 1's "previous" context includes the tail of the
 * sequence — the engine detector handles the wrap when `loop` is set.
 *
 * Dots = engine `propReversal` channel only (display policy above).
 */
export function processReversals(sequence: SequenceData): SequenceData {
  const flags = deriveReversals(sequence.steps, {
    // One-hand LOOP artifacts and freeform circular sequences do not always
    // have a two-hand LOOP label. `isCircular` is the user's actual promise
    // that playback crosses the seam, so step 1 still needs to compare against
    // the tail in those cards.
    loop: sequence.isCircular || !!sequence.loopType,
  });

  const processedSteps = sequence.steps.map((step, i) =>
    applyReversalSymbols(step, {
      leftReversal: flags[i]?.left.propReversal ?? false,
      rightReversal: flags[i]?.right.propReversal ?? false,
    })
  );

  return {
    ...sequence,
    steps: processedSteps,
  };
}

/**
 * Detect reversal (dot channel: prop-direction flip) for a single step based
 * on previous steps (non-loop context: no wrap).
 */
export function detectReversal(
  previousSteps: StepData[],
  currentStep: StepData
): ReversalInfo {
  const flags = deriveReversals([...previousSteps, currentStep]);
  const last = flags[flags.length - 1];
  return {
    leftReversal: last?.left.propReversal ?? false,
    rightReversal: last?.right.propReversal ?? false,
  };
}

/**
 * Apply reversal symbols to a step
 */
export function applyReversalSymbols(
  stepData: StepData,
  reversalInfo: ReversalInfo
): StepData {
  return createStepData({
    ...stepData,
    leftReversal: reversalInfo.leftReversal,
    rightReversal: reversalInfo.rightReversal,
  });
}

/**
 * Detect reversal for an option preview based on current sequence.
 * Used to show reversal indicators on options before they're selected.
 * Dot channel only: prop rotation-direction flip.
 */
export function detectReversalForOption(
  currentSequence: StepData[],
  optionPictographData: PictographData
): ReversalInfo {
  const reversalInfo: ReversalInfo = {
    leftReversal: false,
    rightReversal: false,
  };

  if (!optionPictographData.motions) {
    return reversalInfo;
  }

  // If sequence is empty, no reversals possible
  if (currentSequence.length === 0) {
    return reversalInfo;
  }

  reversalInfo.leftReversal = propFlips(
    lastActivePropDir(currentSequence, HandSide.LEFT),
    optionPictographData.motions.left
  );
  reversalInfo.rightReversal = propFlips(
    lastActivePropDir(currentSequence, HandSide.RIGHT),
    optionPictographData.motions.right
  );

  return reversalInfo;
}

/**
 * Detect reversals for multiple option pictographs at once.
 * Optimized for option picker display where we need to show reversals for all options.
 */
export function detectReversalsForOptions(
  currentSequence: PictographData[],
  options: PictographData[]
): PictographWithReversals[] {
  const empty = currentSequence.length === 0;

  // Anchor once for the whole option set.
  const leftAnchor = empty
    ? null
    : lastActivePropDir(currentSequence, HandSide.LEFT);
  const rightAnchor = empty
    ? null
    : lastActivePropDir(currentSequence, HandSide.RIGHT);

  return options.map((option) => {
    const leftReversal =
      empty || !option.motions
        ? false
        : propFlips(leftAnchor, option.motions.left);
    const rightReversal =
      empty || !option.motions
        ? false
        : propFlips(rightAnchor, option.motions.right);
    return wrapStable(option, leftReversal, rightReversal);
  });
}

/**
 * Identity-stable wrapper cache.
 *
 * The option picker mounts dozens of cards whose entire derived chain keys off
 * the `pictograph` prop's object identity. A fresh `{ ...option }` on every
 * call invalidated all of them even when nothing about the option or its dots
 * had changed, which cost tens of milliseconds of synchronous recomputation on
 * the frame that a pick lands. Re-emitting the previous wrapper whenever the
 * source option and both flags are unchanged keeps those cards untouched.
 *
 * Safe because prepared option objects are treated as immutable: a changed
 * option is always a new object (see `PictographPreparer.prepareBatch`).
 */
const stableWrappers = new WeakMap<PictographData, PictographWithReversals>();

function wrapStable(
  option: PictographData,
  leftReversal: boolean,
  rightReversal: boolean
): PictographWithReversals {
  const cached = stableWrappers.get(option);
  if (
    cached &&
    cached.leftReversal === leftReversal &&
    cached.rightReversal === rightReversal
  ) {
    return cached;
  }
  const wrapper: PictographWithReversals = {
    ...option,
    leftReversal,
    rightReversal,
  };
  stableWrappers.set(option, wrapper);
  return wrapper;
}

// MODULE-PRIVATE HELPERS (option-preview dot channel — prop rotation only)

interface MotionLike {
  readonly rotationDirection?: string;
  readonly prefloatRotationDirection?: string;
  readonly motionType?: string;
}

interface SignalCarrier {
  readonly isBlank?: boolean;
  readonly motions?: {
    readonly left?: MotionLike | null;
    readonly right?: MotionLike | null;
  } | null;
}

/**
 * Effective prop rotation of a motion. A float reads its preserved pre-float
 * direction; other motions use the rendered direction. Static/dash without a
 * direction are neutral, while malformed rotating motions warn and default cw.
 */
function propDirOf(motion: MotionLike | null | undefined): string | null {
  if (!motion) return null;
  const effectiveDirection = getEffectiveRotationDirection(motion);
  if (effectiveDirection) return effectiveDirection;
  if (motion.motionType === "static" || motion.motionType === "dash") {
    return "noRotation";
  }
  console.warn(
    `Missing rotationDirection for motion type "${motion.motionType}". Defaulting to 'cw'.`
  );
  return "cw";
}

/**
 * Last active prop rotation direction for one hand, walking backwards through
 * the sequence and looking past blanks / noRotation (production semantics).
 */
function lastActivePropDir(
  items: readonly SignalCarrier[],
  hand: HandSide
): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (!item || item.isBlank) continue;
    const motion = item.motions?.[hand];
    if (!motion) continue;
    const dir = propDirOf(motion);
    if (dir && dir !== "noRotation") return dir;
  }
  return null;
}

/**
 * Dot rule for an option's motion against the sequence anchor: the prop's
 * rotation direction flips. Floats compare their preserved pre-float direction
 * because their rendered noRotation value is intentionally neutral.
 */
function propFlips(
  anchor: string | null,
  motion: MotionLike | null | undefined
): boolean {
  if (!anchor || !motion) return false;
  const cur = getEffectiveRotationDirection(motion);
  return cur !== null && cur !== "noRotation" && cur !== anchor;
}

// SINGLETON EXPORT (backward-compatible object form for class consumers)
export const reversalDetector = {
  processReversals,
  detectReversal,
  applyReversalSymbols,
  detectReversalForOption,
  detectReversalsForOptions,
};

/** Structural type matching the reversal-detector module's public API. */
export type ReversalDetector = typeof reversalDetector;
