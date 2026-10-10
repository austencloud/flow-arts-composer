/**
 * SequenceMotionLoader
 *
 * Ensures sequence data has motion information for animation playback.
 * Delegates to PublicSequencesLoader for gallery-based sequence loading.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { getBrowseLoader } from "#lib/shared/browse/get-browse-loader.js";

export async function ensureMotionData(
  seq: SequenceData
): Promise<SequenceData | null> {
  // Check if sequence already has motion data
  const hasMotions = seq.steps?.some(
    (b) => b?.motions?.left && b?.motions?.right
  );
  if (hasMotions) return seq;

  // Try to load from gallery using word/name (gallery sequences)
  const galleryId = seq.word || seq.name;
  if (galleryId) {
    try {
      const loaded = await getBrowseLoader().loadFullSequenceData(
        galleryId,
        seq.id
      );
      if (loaded?.steps?.some((b) => b?.motions?.left && b?.motions?.right)) {
        return loaded;
      }
    } catch (err) {
      console.warn(`Could not load sequence from gallery: ${galleryId}`, err);
    }
  }

  // Return original sequence if we couldn't load motion data
  return seq;
}
