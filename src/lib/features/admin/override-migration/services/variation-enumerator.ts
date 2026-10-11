import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { letterQueryHandler } from "#lib/shared/pictograph/tka-glyph/services/letter-query-handler.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

export interface VariationArrow {
  pictographData: PictographData;
  arrowHand: HandSide;
}

/** Yields every (pictograph variation, arrow) pair the renderer can draw,
 *  across diamond + box. Source: the app's CSV-backed variation dataset
 *  via letterQueryHandler.getAllPictographVariations. */
export async function enumerateVariationArrows(): Promise<VariationArrow[]> {
  const diamond = await letterQueryHandler.getAllPictographVariations(
    GridMode.DIAMOND
  );
  const box = await letterQueryHandler.getAllPictographVariations(GridMode.BOX);
  const out: VariationArrow[] = [];
  for (const pictographData of [...diamond, ...box]) {
    if (pictographData.motions?.left)
      out.push({ pictographData, arrowHand: HandSide.LEFT });
    if (pictographData.motions?.right)
      out.push({ pictographData, arrowHand: HandSide.RIGHT });
  }
  return out;
}
