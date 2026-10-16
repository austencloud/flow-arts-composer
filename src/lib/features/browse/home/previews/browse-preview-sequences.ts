/**
 * Sequences for the Browse home's tile previews. A wall of cards needs
 * several different sequences, so they come from drawMatrixRealization(),
 * the Firebase-free pool behind the home hero that Create's Generate and
 * Tunnel previews draw from. No Firestore read: the previews are on screen
 * for every visit to Browse. When the pool cannot load, every slot falls
 * back on Create's demo sequence, from a different step.
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
import { drawMatrixRealization } from "#lib/shared/landing/data/shape-matrix-hero-pool.js";
import {
  DEMO_SEQUENCE,
  startPictograph,
} from "#lib/features/create/shared/components/method-previews/method-preview-demo.js";

export interface PreviewSequence {
  sequence: SequenceData;
  /** The step a resting card shows. */
  offset: number;
  /** The word a card shows, simplified for display. */
  word: string;
}

/** The longest a scene waits for the pool before it uses the demo. */
export const PREVIEW_DRAW_TIMEOUT_MS = 1500;

function displayWord(sequence: SequenceData): string {
  return simplifyRepeatedWord(sequence.word ?? sequence.name ?? "");
}

/** Slot `index` on the demo sequence: a different step for each slot. */
export function demoPreviewSequence(index: number): PreviewSequence {
  const length = Math.max(1, DEMO_SEQUENCE.steps.length);
  return {
    sequence: DEMO_SEQUENCE,
    offset: (index * 3) % length,
    word: displayWord(DEMO_SEQUENCE),
  };
}

/**
 * `count` sequences with different words where the pool has them. Draws run
 * one after another and stop at the timeout; slots still empty then take the
 * demo. Resolves with exactly `count` entries.
 */
export async function drawPreviewSequences(
  count: number,
  options: {
    timeoutMs?: number;
    draw?: () => Promise<{ sequence: SequenceData } | null>;
  } = {}
): Promise<PreviewSequence[]> {
  const draw = options.draw ?? (() => drawMatrixRealization());
  const deadline = Date.now() + (options.timeoutMs ?? PREVIEW_DRAW_TIMEOUT_MS);
  const drawn: PreviewSequence[] = [];
  const words = new Set<string>();
  // A few extra tries cover draws that repeat a word.
  let tries = count * 3;
  while (drawn.length < count && tries-- > 0 && Date.now() < deadline) {
    let result: { sequence: SequenceData } | null = null;
    try {
      result = await draw();
    } catch (error) {
      console.warn("[browse preview] could not draw a sequence", error);
      break;
    }
    if (!result || result.sequence.steps.length === 0) break;
    const word = displayWord(result.sequence);
    if (words.has(word)) continue;
    words.add(word);
    drawn.push({ sequence: result.sequence, offset: 0, word });
  }
  for (let index = drawn.length; index < count; index++) {
    drawn.push(demoPreviewSequence(index));
  }
  return drawn;
}

/** The step `step` places after a card's resting step, wrapping around. */
export function previewStep(entry: PreviewSequence, step = 0): StepData | null {
  const steps = entry.sequence.steps;
  if (steps.length === 0) return null;
  return steps[(entry.offset + step) % steps.length] ?? null;
}

/** The pose that step moves from: the step before, or the start position. */
export function previewPoseBefore(
  entry: PreviewSequence,
  step = 0
): StepData | PictographData | null {
  const steps = entry.sequence.steps;
  if (steps.length === 0) return null;
  const at = (entry.offset + step) % steps.length;
  return at === 0 ? startPictograph(entry.sequence) : (steps[at - 1] ?? null);
}
