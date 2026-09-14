import type {
  SequenceSharePayload,
  SequenceShareSource,
} from "./models/sequence-share-payload";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";

export function buildSequenceSharePayload(
  seq: SequenceShareSource
): SequenceSharePayload {
  const sequenceWord = simplifyRepeatedWord(
    seq.displayName || seq.intendedWord || seq.word || ""
  );

  return {
    sequence: seq,
    sequenceId: seq.id,
    sequenceWord,
    sequenceCloudWord: seq.word || undefined,
    sequenceName: seq.name || undefined,
    sequenceThumbnail: seq.thumbnails?.[0] || seq.thumbnailUrl || undefined,
    // `author` is legacy tool attribution ("TKA Explore"), not a person; the
    // owner is the only name worth putting after "by".
    sequenceAuthor: seq.ownerDisplayName || undefined,
    sequenceStepCount: seq.steps?.length || undefined,
  };
}
