/**
 * SequenceData adapter for the sequence engine's orientation-cycle closure.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  closeSequenceOrientationCycle,
  getSequenceOrientationCycleCount,
} from "#lib/shared/create/services/sequence-orientation-cycle.js";

export class OrientationCycleExtender {
  /**
   * How many total repeats bring the props back to their start orientation.
   * 1 means the sequence already closes in-orientation. Non-mutating — the
   * Extend drawer uses this to decide whether to offer the option, and to
   * label it with the count, before anything is applied.
   */
  getCycleCount(sequence: SequenceData): 1 | 2 | 4 | 8 {
    if (!sequence.steps?.length) return 1;

    try {
      return getSequenceOrientationCycleCount(sequence);
    } catch {
      // The engine throws rather than mislabel a sequence whose orientation
      // never returns within eight repetitions. That is a legitimate answer
      // to "how many repeats close this?" — none do. This is a read used to
      // decide whether to OFFER the repeat, so it reports 1 (nothing to
      // offer) instead of propagating into the panel that merely opened.
      return 1;
    }
  }

  extendIfNeeded(sequence: SequenceData): SequenceData {
    return closeSequenceOrientationCycle(sequence);
  }
}

export const orientationCycleExtender = new OrientationCycleExtender();
