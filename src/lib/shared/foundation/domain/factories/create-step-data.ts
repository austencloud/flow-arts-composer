/**
 * Factory function for creating StepData
 *
 * Creates a beat with proper type discriminator.
 * Steps represent actual motions in a sequence (stepNumber >= 1).
 *
 * `motions` in the input may carry 0, 1, or 2 hands; the factory fills every
 * missing hand with an invisible static placeholder so the output always
 * satisfies the both-required canonical `Step` shape. Callers that mean
 * "this hand is not really there" simply omit it, exactly as before.
 */
import type { StepData, StepMotions } from "$lib/shared/foundation/domain/models/step-data";
import {
  createPlaceholderMotion,
  type MotionData,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { normalizeLegacyStep } from "@tka/tka-types";

export type CreateStepDataInput = Omit<Partial<StepData>, "motions"> & {
  readonly motions?: Partial<Record<HandSide, MotionData | undefined>>;
};

export function createStepData(data: CreateStepDataInput = {}): StepData {
  data = normalizeLegacyStep(data);
  const motions: StepMotions = {
    left: data.motions?.left ?? createPlaceholderMotion(HandSide.LEFT),
    right: data.motions?.right ?? createPlaceholderMotion(HandSide.RIGHT),
  };
  return {
    // Canonical Step properties
    id: data.id ?? crypto.randomUUID(),
    letter: data.letter ?? null,
    startPlacement: data.startPlacement ?? null,
    endPlacement: data.endPlacement ?? null,
    motions,

    // Beat context properties
    stepNumber: data.stepNumber ?? 1, // Should always be >= 1
    duration: data.duration ?? 1.0,
    leftReversal: data.leftReversal ?? false,
    rightReversal: data.rightReversal ?? false,
    isBlank: data.isBlank ?? false,
    ...(data.gridMode !== undefined && { gridMode: data.gridMode }),
    ...(data.variation !== undefined && { variation: data.variation }),
    ...(data.isBridge !== undefined && { isBridge: data.isBridge }),
    ...(data.category !== undefined && { category: data.category }),
    // Beta offset swap — preserve if set
    ...(data.betaSwapped !== undefined && { betaSwapped: data.betaSwapped }),
  };
}
