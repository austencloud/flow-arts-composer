import { describe, expect, it } from "vitest";
import { createStartPlacementVariations } from "#lib/shared/components/placement-picker/start-placement-utils.js";
import { getGridLocationsFromPlacement } from "#lib/shared/pictograph/grid/services/grid-placement-deriver.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

// The fallback start placements read their hand locations from the placement
// deriver; this file used to keep its own copy of the table.
describe("createStartPlacementVariations", () => {
  it.each([GridMode.DIAMOND, GridMode.BOX])(
    "puts each %s start placement's hands where the deriver says",
    (gridMode) => {
      const variations = createStartPlacementVariations(gridMode);
      expect(variations).toHaveLength(16);
      for (const pictograph of variations) {
        const [left, right] = getGridLocationsFromPlacement(
          pictograph.startPlacement!
        );
        expect(pictograph.motions[HandSide.LEFT]?.startLocation).toBe(left);
        expect(pictograph.motions[HandSide.RIGHT]?.startLocation).toBe(right);
      }
    }
  );
});
