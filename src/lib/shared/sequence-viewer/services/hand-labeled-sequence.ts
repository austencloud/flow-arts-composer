/**
 * The sequence a card should draw beside performance footage.
 *
 * Mirroring makes the geometry match the camera: E and W trade places and the
 * rotation arrows reverse, which is what an audience sees. The hand swap on
 * top changes no shape and no arrow. It only moves the colors, so the color on
 * the viewer's right is the viewer's right hand. Together they are "mirror me".
 *
 * The mirror derives letters asynchronously, so the result is memoized by the
 * source object. `SequenceData` carries no revision stamp; a changed sequence
 * is a new object, so identity is the right key. Same approach as the cache
 * PostStudio used for its mirror toggle before this module owned it.
 */
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  mirrorSequence,
  swapHands,
} from "$lib/shared/create/services/sequence-transformer";
import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";

export interface HandLabelingTransforms {
  mirror: (sequence: SequenceData) => Promise<SequenceData>;
  swap: (sequence: SequenceData) => SequenceData;
}

export type HandLabeledSequenceResolver = (
  sequence: SequenceData,
  labeling: HandLabeling
) => Promise<SequenceData>;

export function createHandLabeledSequenceResolver(
  transforms: HandLabelingTransforms
): HandLabeledSequenceResolver {
  const cache = new WeakMap<SequenceData, Promise<SequenceData>>();
  return (sequence, labeling) => {
    if (labeling === "as-performed") return Promise.resolve(sequence);
    let held = cache.get(sequence);
    if (!held) {
      held = transforms.mirror(sequence).then(transforms.swap);
      cache.set(sequence, held);
      // A failed mirror must not poison the cache for the next attempt.
      held.catch(() => cache.delete(sequence));
    }
    return held;
  };
}

/** The app-wide resolver, on the real transforms. */
export const sequenceForHandLabeling: HandLabeledSequenceResolver =
  createHandLabeledSequenceResolver({
    mirror: (sequence) => mirrorSequence(sequence),
    swap: swapHands,
  });
