/**
 * Local data for Create method previews: the home page's 16-step demo
 * sequence (MYΩN four times), already shipped with the landing page.
 * Imported directly; per-visit-demo.ts pulls in a worker client. No
 * Firestore and no workers (spec: Scenes).
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import demoJson from "#lib/shared/landing/data/demo-sequence.json";

export const DEMO_SEQUENCE = demoJson as unknown as SequenceData;

/**
 * Where each scene's steps start in the demo sequence, so cards resting side
 * by side never show the same pictograph. Construct takes the opening, Fuse
 * the two steps after Construct's, and Generate starts a half turn on.
 * Construct's 0 is fixed: ConstructScene always shows the sequence's opening.
 *
 * Assemble writes an N and an M, the only steps where both hands move. Every
 * such pair is already some card's, so it takes the third, which only
 * Generate's widest strip and its grid of eight also show, and only until
 * Generate's first roll.
 */
export const DEMO_STEP_START = Object.freeze({
  construct: 0,
  fuse: 3,
  generate: 8,
  assemble: 11,
});

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
