import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { calculate as calculateMandalaGeometry } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import { createDefaultStickerSheet } from "#lib/features/sticker-lab/domain/sticker-types.js";
import { createMandalaPrimitiveRef } from "#lib/features/sticker-lab/domain/mandala-primitive-reference.js";
import { addPrimitiveToSheet } from "#lib/features/sticker-lab/domain/sticker-sheet-mutations.js";
import { getStickerSheetRepository } from "#lib/features/sticker-lab/get-sticker-sheet-repository.js";
import { cachePrimitivePaths } from "#lib/features/sticker-lab/state/mandala-paths-cache.svelte.js";
import { goto } from "$app/navigation";

export function sendToStickerLab(seq: SequenceData): void {
  const paths = calculateMandalaGeometry(seq.steps, "staff", "staff");
  const ref = createMandalaPrimitiveRef(seq, paths);
  cachePrimitivePaths(ref.shapeHash, paths);

  const repository = getStickerSheetRepository();
  const sheet = repository.load() ?? createDefaultStickerSheet();
  repository.save(addPrimitiveToSheet(sheet, ref));

  goto("/lab/stickers");
}
