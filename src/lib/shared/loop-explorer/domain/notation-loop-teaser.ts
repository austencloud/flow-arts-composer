import { LOOPType } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import teaserSeedJson from "./notation-loop-teaser-seed.json";
import {
  hydrateCuratedSequence,
  type CuratedSequenceWire,
} from "./curated-seed-hydrator";

/**
 * The editorial LOOP example is copied from rotated/quartered seed zero in the
 * verified fallback corpus. Keeping this single-sequence fixture separate
 * prevents public notation routes from parsing the complete 1.37 MB corpus.
 * The corpus test locks the copy to its canonical source.
 */
export const NOTATION_LOOP_TEASER_SEQUENCE: SequenceData =
  hydrateCuratedSequence(
    teaserSeedJson as CuratedSequenceWire,
    LOOPType.ROTATED,
    "quartered",
    0
  );
