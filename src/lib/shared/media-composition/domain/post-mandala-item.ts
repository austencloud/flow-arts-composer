import { POST_BOX } from "@austencloud/video-editor/core";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { deriveWord } from "#lib/shared/foundation/services/word-deriver.js";
import {
  DEFAULT_MANDALA_LOOK,
  DEFAULT_MANDALA_SHIFT,
} from "#lib/shared/mandala/domain/mandala-shift-types.js";
import {
  MANDALA_ITEM_SECONDS,
  MANDALA_SOURCE_SECONDS,
  type MandalaSequenceSnapshot,
  type PostMandalaItem,
} from "#lib/shared/post-studio-plugin/index.js";

/** One entry of a mandala clip's list: the full record, named for its row. */
export function mandalaSequenceSnapshot(
  sequence: SequenceData
): MandalaSequenceSnapshot {
  return {
    id: sequence.id,
    name: sequence.displayName || sequence.word || deriveWord(sequence),
    sequence,
  };
}

/**
 * A new mandala clip: 16 seconds of an endless source, on the beat from the
 * post's grid, with the default shift and look.
 */
export function createMandalaItem(
  sequences: readonly MandalaSequenceSnapshot[],
  id: string,
  start = 0,
  main = true
): PostMandalaItem {
  return {
    id,
    kind: "mandala",
    sequences: [...sequences],
    shift: { ...DEFAULT_MANDALA_SHIFT },
    look: { ...DEFAULT_MANDALA_LOOK },
    start,
    duration: MANDALA_ITEM_SECONDS,
    sourceIn: 0,
    sourceOut: MANDALA_SOURCE_SECONDS,
    speed: 1,
    box: { ...POST_BOX.full },
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    anchor: null,
    fill: false,
    ...(main ? {} : { pinnedStart: true }),
  };
}
