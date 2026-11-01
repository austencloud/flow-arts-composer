/**
 * The example Settings → Display draws on its three stages: one letter A
 * pictograph, and a four-step A sequence that returns to where it started so
 * the animation loops without a jump. Built from the bundled letter data, with
 * no Firestore or sequence fetch (the retired tab's preview fetched one).
 *
 * Letter A travels a quarter of the diamond each step, so four A's chained
 * end on end (each starting where the last ended, both hands turning the same
 * way throughout) make a closed loop.
 */

import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import {
  createSequenceData,
  type SequenceData,
} from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import { deriveStartPlacementFromSteps } from "#lib/shared/foundation/services/sequence-hydrator.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { letterQueryHandler } from "#lib/shared/pictograph/tka-glyph/services/letter-query-handler.js";

/** The card lengths the card stage offers: one info cell, then several. */
export const CARD_LENGTHS = [4, 8, 16] as const;
export type CardLength = (typeof CARD_LENGTHS)[number];

export interface DisplayExample {
  /** Letter A, the pictograph stage. */
  pictograph: StepData;
  /** Four A's in a closed loop, for the animation stage. */
  sequence: SequenceData;
  /** The same loop at each card length, for the card stage. */
  cards: Readonly<Record<CardLength, SequenceData>>;
}

const STEP_COUNT = 4;

function follows(prev: PictographData, next: PictographData): boolean {
  for (const hand of ["left", "right"] as const) {
    const a = prev.motions[hand];
    const b = next.motions[hand];
    if (!a || !b) return false;
    if (b.startLocation !== a.endLocation) return false;
    if (b.rotationDirection !== a.rotationDirection) return false;
  }
  return true;
}

/** Four variations of one letter, each starting where the last ended. */
export function chainClosedLoop(
  variations: readonly PictographData[],
  length = STEP_COUNT
): PictographData[] | null {
  for (const first of variations) {
    const chain = [first];
    while (chain.length < length) {
      const prev = chain[chain.length - 1]!;
      const next = variations.find((p) => follows(prev, p));
      if (!next) break;
      chain.push(next);
    }
    if (chain.length === length && follows(chain[length - 1]!, first)) {
      return chain;
    }
  }
  return null;
}

function loopSequence(chain: readonly PictographData[]): SequenceData {
  const steps = chain.map((p, i) =>
    createStepData({ ...p, id: `display-example-${i + 1}`, stepNumber: i + 1 })
  );
  const word = "A".repeat(steps.length);
  return createSequenceData({
    id: `settings-display-example-${steps.length}`,
    name: word,
    word,
    steps,
    startPlacement: deriveStartPlacementFromSteps(steps),
    gridMode: GridMode.DIAMOND,
  });
}

async function build(): Promise<DisplayExample | null> {
  const all = await letterQueryHandler.getAllPictographVariations(
    GridMode.DIAMOND
  );
  const letterA = all.filter((p) => p.letter === Letter.A);
  const chain = chainClosedLoop(letterA);
  if (!chain) return null;

  // The loop closes after four steps, so longer cards repeat it.
  const repeated = (length: number) =>
    Array.from({ length }, (_, i) => chain[i % chain.length]!);
  const sequence = loopSequence(chain);
  const cards = Object.fromEntries(
    CARD_LENGTHS.map((length) => [
      length,
      length === STEP_COUNT ? sequence : loopSequence(repeated(length)),
    ])
  ) as Record<CardLength, SequenceData>;
  return { pictograph: sequence.steps[0]!, sequence, cards };
}

let pending: Promise<DisplayExample | null> | null = null;

/** Built once per session; every stage shares the same instance. */
export function loadDisplayExample(): Promise<DisplayExample | null> {
  pending ??= build().catch((error) => {
    console.error("[display-example] could not build the example:", error);
    pending = null;
    return null;
  });
  return pending;
}
