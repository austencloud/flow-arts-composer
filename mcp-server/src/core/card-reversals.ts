/**
 * Reversal flags for card rendering, sourced from THE canonical detector in
 * `@tka/sequence-engine` so MCP cards dot the same steps the Composer does.
 *
 * Display policy: dots come from the `propReversal` channel only. Loop wrap
 * and transparent static/dash chains are the engine's business, not ours.
 */
import { deriveReversals } from "@tka/sequence-engine";

interface CardMotion {
  motionType?: string;
  rotationDirection?: string;
  startLocation?: string;
  endLocation?: string;
}

interface CardReversalStep {
  stepNumber: number;
  leftMotion: CardMotion;
  rightMotion: CardMotion;
  leftReversal?: boolean;
  rightReversal?: boolean;
}

export function applyCanonicalReversals<TStep extends CardReversalStep>(
  steps: TStep[],
  loop: boolean
): TStep[] {
  const flags = deriveReversals(
    steps.map((step) => ({
      stepNumber: step.stepNumber,
      motions: { left: step.leftMotion, right: step.rightMotion },
    })),
    { loop }
  );
  return steps.map((step, index) => ({
    ...step,
    leftReversal: flags[index]?.left.propReversal ?? false,
    rightReversal: flags[index]?.right.propReversal ?? false,
  }));
}
