import { describe, expect, it } from "vitest";

import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { getRailPropGlyphPresentation } from "../rail-prop-optical-fit";

describe("rail prop optical fit", () => {
  it("defines safe geometry for every selectable prop", () => {
    for (const propType of Object.values(PropType)) {
      const presentation = getRailPropGlyphPresentation(propType);
      expect(presentation.scale, propType).toBeGreaterThan(0);
      expect(
        [
          presentation.scale,
          presentation.rotation,
          presentation.translateX,
          presentation.translateY,
        ].every(Number.isFinite),
        propType
      ).toBe(true);
    }
  });

  it.each([PropType.CLUB, PropType.CLASSIC_CLUB, PropType.BIGCLUB])(
    "stands %s upright in the rail",
    (propType) => {
      expect(getRailPropGlyphPresentation(propType).rotation).toBe(-90);
    }
  );
});
