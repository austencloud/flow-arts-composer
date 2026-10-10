import { reversalDetector } from "#lib/shared/create/services/reversal-detector.js";
import {
  updateSequenceData,
  type SequenceData,
} from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { SoloPropData } from "#lib/shared/foundation/domain/models/solo-prop-data.js";
import { soloPropToSequence } from "#lib/shared/foundation/services/solo-prop-sequence-adapter.js";
import type { FuseSide } from "../state/fuse-shuffle-pool.svelte";

/**
 * Turn one Fuse hand path back into the circular sequence its card renders.
 * Generic solo conversion preserves the motions but does not derive display
 * metadata, so rebuilt followers used to lose their reversal dots here.
 */
export function createCircularFuseSoloSequence(
  side: FuseSide,
  solo: SoloPropData
): SequenceData {
  const sequence = updateSequenceData(
    soloPropToSequence(solo, side),
    { isCircular: true }
  );

  return reversalDetector.processReversals(sequence);
}
