import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { calculate as calculateMandalaGeometry } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import { createMandalaPrimitiveRef } from "../../domain/mandala-primitive-reference";
import type { MandalaPrimitiveRef } from "../../domain/sticker-types";
import type { IStickerPrimitiveMigrator } from "../contracts/IStickerPrimitiveMigrator";

export type StickerSequenceLoader = (
  sequenceId: string
) => Promise<SequenceData | null>;

export class StickerPrimitiveMigrator implements IStickerPrimitiveMigrator {
  constructor(private readonly loadSequence: StickerSequenceLoader) {}

  async resolveGeometryIdentity(
    ref: MandalaPrimitiveRef
  ): Promise<MandalaPrimitiveRef | null> {
    if (ref.identityKind === "geometry-v1") return ref;
    if (!ref.representativeSequenceId) return null;

    const sequence = await this.loadSequence(ref.representativeSequenceId);
    if (!sequence?.steps?.length) return null;

    const paths = calculateMandalaGeometry(sequence.steps, "staff", "staff");
    const resolved = createMandalaPrimitiveRef(sequence, paths);
    return {
      ...resolved,
      displayName: ref.displayName ?? resolved.displayName,
      sourceLoop: ref.sourceLoop ?? resolved.sourceLoop,
    };
  }
}
