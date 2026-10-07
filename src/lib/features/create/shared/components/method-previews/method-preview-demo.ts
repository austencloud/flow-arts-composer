/**
 * Local data for Create method previews: the home page's 16-step demo
 * sequence (MYΩN four times), already shipped with the landing page.
 * Imported directly; per-visit-demo.ts pulls in a worker client. No
 * Firestore and no workers (spec: Scenes).
 */
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import demoJson from "$lib/shared/landing/data/demo-sequence.json";

export const DEMO_SEQUENCE = demoJson as unknown as SequenceData;

/** A sequence's start placement, under either field name. */
export function startPictograph(sequence: SequenceData): PictographData | null {
  return sequence.startPlacement ?? sequence.startingPlacement ?? null;
}

/** The first `count` steps. */
export function openingSteps(
  sequence: SequenceData,
  count: number
): readonly StepData[] {
  return sequence.steps.slice(0, Math.max(0, count));
}
