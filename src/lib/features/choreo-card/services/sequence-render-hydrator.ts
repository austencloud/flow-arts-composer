import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  createMotionData,
  type MotionData,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { reversalDetector } from "$lib/shared/create/services/reversal-detector";
import { normalizeLegacySequence } from "@tka/tka-types";
import { hydrate } from "$lib/shared/foundation/services/sequence-hydrator";

function letterFromGridPlacement(gridPlacement: unknown): Letter | null {
  if (!gridPlacement) return null;
  const placement = String(gridPlacement).toLowerCase();
  if (placement.startsWith("alpha")) return Letter.ALPHA;
  if (placement.startsWith("beta")) return Letter.BETA;
  if (placement.startsWith("gamma")) return Letter.GAMMA;
  if (placement.startsWith("zeta")) return Letter.ZETA;
  if (placement.startsWith("eta")) return Letter.ETA;
  return null;
}

function hydrateMotions(
  motions: PictographData["motions"] | undefined
): Partial<Record<HandSide, MotionData>> {
  const hydrated: Partial<Record<HandSide, MotionData>> = {};
  for (const [color, motion] of Object.entries(motions ?? {})) {
    if (motion) hydrated[color as HandSide] = createMotionData(motion);
  }
  return hydrated;
}

function hydrateSteps(
  steps: readonly StepData[] | undefined
): readonly StepData[] {
  if (!steps || steps.length === 0) return [];
  return steps.map((step, index) => {
    const raw = step as unknown as Record<string, unknown>;
    const beat = typeof raw.beat === "number" ? raw.beat : undefined;
    return createStepData({
      ...step,
      stepNumber:
        step.stepNumber ?? (beat !== undefined ? beat + 1 : index + 1),
      duration: step.duration ?? 1,
      leftReversal: step.leftReversal ?? false,
      rightReversal: step.rightReversal ?? false,
      isBlank: step.isBlank ?? false,
      motions: hydrateMotions(step.motions),
    });
  });
}

/**
 * Turn a durable Firestore/embedded sequence blob into render-ready data.
 * Motion placement fields are derived runtime data, so persisted blobs omit
 * them; rendering the raw object silently drops every arrow and prop.
 */
export function hydrateSequence(raw: Record<string, unknown>): SequenceData {
  // Normalize before the factory narrows the object. Historical public-index,
  // QR, and printed-card payloads still carry blue/red field names; once the
  // factory has selected canonical fields those aliases can no longer be
  // recovered.
  const created = createSequenceData(normalizeLegacySequence(raw));
  const sequence = created.steps.length > 0 ? created : hydrate(created);
  const startPlacement = sequence.startPlacement
    ? {
        ...sequence.startPlacement,
        motions: hydrateMotions(sequence.startPlacement.motions),
        letter:
          sequence.startPlacement.letter ??
          letterFromGridPlacement(sequence.startPlacement.gridPlacement),
      }
    : undefined;

  const hydrated: SequenceData = {
    ...sequence,
    steps: hydrateSteps(sequence.steps),
    ...(startPlacement && { startPlacement }),
  };

  const hasStoredReversals = hydrated.steps.some(
    (step) => step.leftReversal !== undefined || step.rightReversal !== undefined
  );
  return hasStoredReversals
    ? hydrated
    : reversalDetector.processReversals(hydrated);
}
