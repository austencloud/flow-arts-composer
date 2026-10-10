import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { MandalaPaths } from "#lib/shared/mandala/domain/mandala-types.js";
import {
  orbitKey,
  shapeKey,
} from "#lib/shared/mandala/services/mandala-fingerprint.js";
import type { MandalaPrimitiveRef } from "./sticker-types";

export function sequenceDisplayName(sequence: SequenceData): string {
  return (
    sequence.displayName ||
    sequence.intendedWord ||
    sequence.word ||
    sequence.name ||
    sequence.id
  );
}

export function createMandalaPrimitiveRef(
  sequence: SequenceData,
  paths: MandalaPaths
): MandalaPrimitiveRef {
  const displayName = sequenceDisplayName(sequence);
  return {
    shapeHash: shapeKey(paths),
    ultraHash: orbitKey(paths),
    identityKind: "geometry-v1",
    representativeSequenceId: sequence.id,
    sourceLoop: {
      sequenceId: sequence.id,
      word: displayName,
      loopType: sequence.loopType ?? "none",
    },
    displayName,
  };
}
