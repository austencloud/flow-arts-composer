import { describe, expect, it } from "vitest";
import { PropType } from "../enums/prop-type";
import { getCompositionRecipe } from "../prop-composition-recipes";

describe("getCompositionRecipe", () => {
  it("gives a variant its base family's recipe when the base has one, even if the variant also has a dormant entry", () => {
    // Trigeng's own FAMILY_RECIPES entry is dormant: it inherits the triad's
    // recipe, same as main before the branch's precedence flip.
    expect(getCompositionRecipe(PropType.TRIGENG)).toEqual(
      getCompositionRecipe(PropType.TRIAD)
    );
    // Torch inherits from its club base the same way.
    expect(getCompositionRecipe(PropType.TORCH)).toEqual(
      getCompositionRecipe(PropType.CLUB)
    );
  });

  it("gives the triangle its own recipe instead of the mini hoop's", () => {
    const triangle = getCompositionRecipe(PropType.TRIANGLE);
    const minihoop = getCompositionRecipe(PropType.MINIHOOP);
    expect(triangle).not.toEqual(minihoop);
    // The interlocked pair: right prop rotated 180 degrees against the left.
    expect(triangle.right.rotation).toBe(180);
  });
});
