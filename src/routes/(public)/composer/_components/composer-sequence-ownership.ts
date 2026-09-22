import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

/** The lower demonstrations need a sequence before the hero can reach a
 * playback boundary. The baked opening keeps them usable while the hero is
 * paused, offscreen, or still preparing its first live continuation. */
export function resolveComposerCarriedSequence(
  visitorSequence: SequenceData | null,
  latchedHeroSequence: SequenceData | null,
  openingSequence: SequenceData
): SequenceData {
  return visitorSequence ?? latchedHeroSequence ?? openingSequence;
}

/** The generator follows the page until its visitor asks for a fresh result.
 * After that, the preview stays on the result they chose instead of being
 * replaced by activity in another demonstration. */
export function shouldAdoptCarriedSequence(
  current: SequenceData | null,
  incoming: SequenceData | null,
  hasGeneratedLocally: boolean
): incoming is SequenceData {
  return (
    !hasGeneratedLocally && incoming !== null && incoming.id !== current?.id
  );
}

/** The construct attract act is allowed to animate its own panel, but only a
 * real visitor interaction may carry that work into the rest of the page. */
export function isVisitorOwnedConstructSequence(
  visitorOwnsBuild: boolean,
  candidate: SequenceData | null
): candidate is SequenceData {
  return visitorOwnsBuild && candidate !== null;
}
