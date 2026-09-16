/**
 * deriveReversals — THE canonical reversal detector. Computes per-hand,
 * per-channel reversal signals for a sequence of steps.
 *
 * TKA ground truth (MCP `get_term_definition("reversal")`, verified
 * 2026-07-05) defines three reversal types:
 *   - **hand reversal** — hand retraces its arc, prop continues its spin
 *     (switches pro/anti);
 *   - **prop reversal** — hand continues its arc, prop reverses its spin
 *     (switches pro/anti);
 *   - **full reversal** — both retrace (maintains pro/anti).
 *
 * A motion carries TWO independent directional signals — prop rotation
 * (`rotationDirection`) and hand arc (locations / authored handPath, see
 * ./motion-signals.ts) — reported here as separate channels:
 *   - `propReversal`: the prop's rotation direction flipped. Fires on prop
 *     reversals AND full reversals (both flip prop direction).
 *   - `handReversal`: the hand's arc direction flipped. Fires on hand
 *     reversals AND full reversals.
 *
 * DISPLAY POLICY (Austen, 2026-07-05): the pictograph reversal DOTS render
 * from `propReversal` ONLY — dots are for prop-direction reversals, identical
 * to the legacy rotation-only detector. `handReversal` is a non-display
 * signal channel retained for future consumers (e.g. the practice judgment
 * loop). Do NOT feed it into dot rendering.
 *
 * Canonical chain semantics (adopted from the production app detector):
 *   - **Loop wrap** (`options.loop`): a loop sequence is cyclic, so early
 *     steps look back through the tail — step 1's predecessor context includes
 *     the last step. Non-loop sequences never wrap.
 *   - **Transparent chains**: blank steps, static/dash (noRotation) motions,
 *     and arc-less motions do not break a signal's chain — the walk looks past
 *     them to the last ACTIVE value of the same signal. (The engine's previous
 *     "blank breaks the chain" behavior was drift from production, not
 *     design; the deck reversal system depends on parity with production.)
 *   - Each signal anchors independently: the prop anchor and the arc anchor
 *     may come from different prior steps.
 *   - A blank step and the start-placement step (stepNumber 0) never flag and
 *     never anchor.
 *
 * The returned array is index-aligned with the input. Pure function.
 */

import {
  handArcDirection,
  propRotationDirection,
  type ArcDirection,
  type MotionSignalSource,
  type PropRotation,
} from "./motion-signals.js";

/** One hand's reversal channels for one step. */
export interface ChannelReversals {
  /** Prop rotation direction flipped — THE dot display channel (prop + full reversals). */
  readonly propReversal: boolean;
  /** Hand arc direction flipped — non-display signal channel (hand + full reversals). */
  readonly handReversal: boolean;
}

export interface StepReversals {
  readonly left: ChannelReversals;
  readonly right: ChannelReversals;
}

export interface DeriveReversalsOptions {
  /**
   * Treat the sequence as cyclic (it has a loopType): early steps look back
   * through the tail of the sequence for their prior directions.
   */
  readonly loop?: boolean;
}

/**
 * Minimal structural step shape. Satisfied by the canonical `Step`
 * (tka-types), the engine's `SequenceStep`, and the app's `StepData`.
 */
export interface ReversalStepLike {
  readonly stepNumber?: number;
  readonly isBlank?: boolean;
  readonly motions?: {
    readonly left?: MotionSignalSource | null;
    readonly right?: MotionSignalSource | null;
  } | null;
}

const NO_CHANNELS: ChannelReversals = Object.freeze({
  propReversal: false,
  handReversal: false,
});
const NO_REVERSAL: StepReversals = Object.freeze({
  left: NO_CHANNELS,
  right: NO_CHANNELS,
});

interface HandSignals {
  readonly prop: PropRotation | null;
  readonly arc: ArcDirection | null;
}

const INERT: HandSignals = Object.freeze({ prop: null, arc: null });

/**
 * Compute per-channel reversal signals for each step. Pure function.
 */
export function deriveReversals(
  steps: readonly ReversalStepLike[],
  options: DeriveReversalsOptions = {}
): ReadonlyArray<StepReversals> {
  const n = steps.length;
  const loop = options.loop === true;

  // Extract each hand's signals once. Blank steps and the start-placement step
  // are inert: they never flag and never anchor.
  const leftSignals: HandSignals[] = new Array(n);
  const rightSignals: HandSignals[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const step = steps[i]!;
    if (step.isBlank || step.stepNumber === 0) {
      leftSignals[i] = INERT;
      rightSignals[i] = INERT;
      continue;
    }
    leftSignals[i] = signalsOf(step.motions?.left);
    rightSignals[i] = signalsOf(step.motions?.right);
  }

  const out: StepReversals[] = [];
  for (let i = 0; i < n; i++) {
    const step = steps[i]!;
    if (step.isBlank || step.stepNumber === 0) {
      out.push(NO_REVERSAL);
      continue;
    }
    const left = channelFlips(leftSignals, i, loop);
    const right = channelFlips(rightSignals, i, loop);
    out.push(
      left === NO_CHANNELS && right === NO_CHANNELS
        ? NO_REVERSAL
        : Object.freeze({ left, right })
    );
  }

  return out;
}

function signalsOf(motion: MotionSignalSource | null | undefined): HandSignals {
  if (!motion) return INERT;
  return {
    prop: propRotationDirection(motion),
    arc: handArcDirection(motion),
  };
}

/**
 * Per-channel flips of the step's active signals against each signal's last
 * active value among its predecessors (cyclic when `loop`).
 */
function channelFlips(
  signals: ReadonlyArray<HandSignals>,
  i: number,
  loop: boolean
): ChannelReversals {
  const cur = signals[i]!;
  const propActive = cur.prop === "cw" || cur.prop === "ccw";
  const arcActive = cur.arc !== null;
  if (!propActive && !arcActive) return NO_CHANNELS;

  const n = signals.length;
  // Predecessor visit order matches production: i-1 … 0, then (loop only)
  // n-1 … i. The final self-visit is harmless — a self-anchor never differs.
  const maxVisits = loop ? n : i;

  let anchorProp: PropRotation | null = null;
  let anchorArc: ArcDirection | null = null;

  for (let v = 1; v <= maxVisits; v++) {
    const j = loop ? (i - v + n) % n : i - v;
    const prior = signals[j]!;
    if (
      propActive &&
      anchorProp === null &&
      (prior.prop === "cw" || prior.prop === "ccw")
    ) {
      anchorProp = prior.prop;
    }
    if (arcActive && anchorArc === null && prior.arc !== null) {
      anchorArc = prior.arc;
    }
    const stillNeedProp = propActive && anchorProp === null;
    const stillNeedArc = arcActive && anchorArc === null;
    if (!stillNeedProp && !stillNeedArc) break;
  }

  const propReversal = anchorProp !== null && anchorProp !== cur.prop;
  const handReversal = anchorArc !== null && anchorArc !== cur.arc;
  if (!propReversal && !handReversal) return NO_CHANNELS;
  return Object.freeze({ propReversal, handReversal });
}
