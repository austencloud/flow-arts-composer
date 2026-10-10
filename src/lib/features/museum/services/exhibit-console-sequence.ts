/**
 * What a performer is actually doing once a visitor has pressed some buttons.
 *
 * The console does not own transform maths. Reversing a sequence and swapping
 * which hand plays which role are capabilities the app already owns, in
 * `shared/create/services/sequence-transformer`, and they are subtle: a full
 * reversal reverses step order, rewinds each step, and derives a new start
 * position from the old final end, all while pro stays pro and anti stays anti.
 * A museum-local reimplementation of that would be a second owner of the same
 * behaviour, and the one in the museum would be the one nobody maintains.
 *
 * So this module is an adapter and nothing else: museum sequence in, canonical
 * transform, steps out.
 *
 * A NOTE ON REVERSAL. "Reversal" is a specific TKA concept — hand, prop, or
 * full, marked by coloured dots on a pictograph's left edge. The console's
 * button is a FULL reversal: everything rewinds. Do not label it "reversal" in
 * copy; the verb is "reverse the hand path".
 *
 * Spec: docs/superpowers/specs/2026-08-16-museum-pedestal-and-console-design.md
 */
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  rewindSequence,
  swapHands,
} from "#lib/shared/create/services/sequence-transformer.js";
import { MUSEUM_EXHIBIT_SEQUENCES } from "#lib/features/museum/data/museum-exhibit-sequences.js";
import type { PerformerSettings } from "#lib/features/museum/domain/exhibit-console.js";

/** The bound record, untouched. Throws rather than guessing at an unknown id. */
export function boundSteps(sequenceId: string): readonly StepData[] {
  const sequence = MUSEUM_EXHIBIT_SEQUENCES[sequenceId];
  if (!sequence) {
    throw new Error(
      `Exhibit console: no bound museum sequence "${sequenceId}". ` +
        `Known ids: ${Object.keys(MUSEUM_EXHIBIT_SEQUENCES).join(", ")}`
    );
  }
  return sequence.steps;
}

/**
 * Apply the console's state to the bound sequence.
 *
 * Hands are swapped before the path is reversed. The two commute for the
 * figure the pedestal draws, but this order is the one that reads correctly as
 * a sentence: this is who is doing what, and then this is which way round they
 * are doing it.
 *
 * The bound record is never replaced — every result here is a transform OF the
 * case's own sequence. That is the museum's standing rule about generated
 * variations, and it is why the console has no "show me a different one"
 * button.
 */
export async function effectiveSteps(
  sequenceId: string,
  settings: PerformerSettings
): Promise<readonly StepData[]> {
  const bound = boundSteps(sequenceId);
  if (!settings.handsSwapped && !settings.reversed) return bound;

  let sequence = createSequenceData({
    id: `museum-console-${sequenceId}`,
    name: sequenceId,
    steps: bound,
    isCircular: true,
  });

  if (settings.handsSwapped) sequence = swapHands(sequence);
  if (settings.reversed) sequence = await rewindSequence(sequence);

  return sequence.steps;
}
