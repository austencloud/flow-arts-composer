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

/** The generator catches up to the latest page sequence when it returns to
 * view. After a local draw, it keeps the visitor's chosen result instead. */
export function shouldAdoptCarriedSequence(
  current: SequenceData | null,
  incoming: SequenceData | null,
  hasGeneratedLocally: boolean,
  inViewport: boolean
): incoming is SequenceData {
  return (
    inViewport &&
    !hasGeneratedLocally &&
    incoming !== null &&
    incoming.id !== current?.id
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
