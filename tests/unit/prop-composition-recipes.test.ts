import { describe, expect, it } from "vitest";
import {
  getCompositionRecipe,
  getRecipeFamilies,
} from "../../src/lib/shared/pictograph/prop/domain/prop-composition-recipes";
import { PropType } from "../../src/lib/shared/pictograph/prop/domain/enums/prop-type";

describe("compact prop arrangements", () => {
  it.each([
    [PropType.TORCH, PropType.CLUB],
    [PropType.TRIGENG, PropType.TRIAD],
    [PropType.BIGDOUBLECONTACTBALL, PropType.CONTACTBALL],
  ])(
    "preserves the distinct %s pose inside the %s family",
    (variant, family) => {
      expect(getCompositionRecipe(variant, true)).not.toEqual(
        getCompositionRecipe(family, true)
      );
    }
  );

  it.each([
    [PropType.BIGTORCH, PropType.TORCH],
    [PropType.BIGTRIAD, PropType.TRIAD],
    [PropType.UKULELE, PropType.GUITAR],
    [PropType.BIGDOUBLECONTACTBALL, PropType.DOUBLECONTACTBALL],
  ])(
    "keeps corresponding %s and %s silhouettes in the same pose",
    (variant, family) => {
      expect(getCompositionRecipe(variant, true)).toEqual(
        getCompositionRecipe(family, true)
      );
    }
  );

  it("exposes canonical navigation defaults in the tuning lab", () => {
    const families = getRecipeFamilies();
    expect(families.some(({ propType }) => propType === PropType.POI)).toBe(
      true
    );
    for (const { propType, recipe } of families) {
      expect(recipe).toEqual(getCompositionRecipe(propType, true));
    }
  });
});
