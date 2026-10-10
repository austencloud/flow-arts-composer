import { getLoopDetector } from "#lib/shared/create/get-loop-detector.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
import { hydrateSequence } from "#lib/shared/navigation/services/sequence-hydrator.js";
import { openSequenceOverlay } from "#lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte.js";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";

/**
 * Trace 1's terminal state: the user looking at the sequence they shared.
 *
 * The pipeline is the one SequenceViewerDrawerHost.bootstrapFromUrl() already
 * runs (resolve -> hydrate -> openSequenceOverlay), minus the resolve: the
 * router hands us the SequenceData that resolveForImport already returned, so
 * re-resolving would be a second network read for data we hold.
 *
 * hydrateSequence is NOT optional here. It is what fills in letter-per-step,
 * start/end position, word, isCircular, loopType and gridMode. Skipping it
 * opens a viewer with empty card footers and a null loop type - the exact
 * regression that helper was written to end (sequence-hydrator.ts header).
 *
 * The overlay renders inside SequenceViewerDrawerHost, which MainApplication
 * mounts at :708-710. That is why nothing in this pipeline may run before the
 * app shell is up - see Task 12.
 */
export async function openFiledCard(input: {
  code: string;
  sequence: SequenceData;
  /** How many further cards this share carried, already saved but not opened. */
  extraCards: number;
  /** Display word for the copy. Defaults to the sequence's own word. */
  word?: string;
}): Promise<void> {
  const hydrated = await hydrateSequence(input.sequence, {
    loopDetector: getLoopDetector(),
  });

  // No skipHistoryPush: unlike the ?v= bootstrap, a shared card has no history
  // entry of its own, so the overlay needs to push one or Android's back
  // button exits the app straight out of the viewer.
  openSequenceOverlay(hydrated, {
    analyticsSource: "share_intake",
    shortCode: input.code,
    returnLabel: "Shared card",
  });

  if (input.extraCards <= 0) return;

  // Opening N viewers would have them fight each other, so the rest are filed
  // and NAMED. Saying nothing is how the previous revision lost them.
  const word = simplifyRepeatedWord(
    input.word || hydrated.word || input.sequence.word || ""
  );
  toast.info(
    input.extraCards === 1
      ? `1 more card${word ? ` ("${word}")` : ""} was saved to your library.`
      : `${input.extraCards} more cards were saved to your library.`
  );
}
