import { getSequenceRepository } from "#lib/shared/create/get-sequence-repository.js";
import type { IStickerPrimitiveMigrator } from "./services/contracts/IStickerPrimitiveMigrator";
import { StickerPrimitiveMigrator } from "./services/implementations/StickerPrimitiveMigrator";

let instance: StickerPrimitiveMigrator | null = null;

export function getStickerPrimitiveMigrator(): IStickerPrimitiveMigrator {
  return (instance ??= new StickerPrimitiveMigrator((sequenceId) =>
    getSequenceRepository().getSequence(sequenceId)
  ));
}
