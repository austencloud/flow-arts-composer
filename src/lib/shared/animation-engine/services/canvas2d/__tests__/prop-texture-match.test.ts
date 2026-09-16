import { describe, expect, it } from "vitest";
import { propTextureMatchesRequest } from "../prop-texture-match";

/**
 * The Canvas2D renderer decides per frame whether the sprite the image loader
 * holds is the one the frame params describe. Frame params carry the notation
 * prop type while the loader is fed render keys (fan builds, model sprites),
 * so a plain string comparison was permanently false for every fan build and
 * every model look: the prop froze at the crossfade origin for the whole load
 * plus fade, then snapped.
 */
describe("propTextureMatchesRequest", () => {
  it("matches a fan build render key against its notation prop type", () => {
    expect(
      propTextureMatchesRequest({
        loaded: "fan__fire_bare",
        requested: "fan__fire_bare",
        paramsPropType: "fan",
      })
    ).toBe(true);
    expect(
      propTextureMatchesRequest({
        loaded: "club__model",
        requested: "club__model",
        paramsPropType: "Club",
      })
    ).toBe(true);
  });

  it("is false while a newer render key is still loading", () => {
    expect(
      propTextureMatchesRequest({
        loaded: "fan__fire_bare",
        requested: "fan__lotus",
        paramsPropType: "fan",
      })
    ).toBe(false);
  });

  it("is false while the frame already describes a different notation prop", () => {
    // Params flip to the incoming prop before the manager issues the load.
    expect(
      propTextureMatchesRequest({
        loaded: "staff",
        requested: "staff",
        paramsPropType: "fan",
      })
    ).toBe(false);
  });

  it("is false with nothing loaded and true for plain matching types", () => {
    expect(
      propTextureMatchesRequest({
        loaded: null,
        requested: "staff",
        paramsPropType: "staff",
      })
    ).toBe(false);
    expect(
      propTextureMatchesRequest({
        loaded: "staff",
        requested: "staff",
        paramsPropType: "STAFF",
      })
    ).toBe(true);
    expect(
      propTextureMatchesRequest({
        loaded: "staff",
        requested: "staff",
        paramsPropType: undefined,
      })
    ).toBe(true);
  });
});
