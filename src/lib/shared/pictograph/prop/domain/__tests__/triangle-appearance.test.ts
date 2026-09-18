import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRIANGLE_GRIP,
  isTrianglePropType,
  normalizeTriangleGrip,
  parseTriangleRenderKey,
  resolveTriangleRenderKey,
  triangleAppearanceArtwork,
  triangleSpriteKey,
} from "../triangle-appearance";
import {
  basePropTypeOfRenderKey,
  hasModelSprite,
  resolvePropRenderKey,
} from "../prop-look";
import { getPropDimensions } from "$lib/shared/animation-engine/services/IPropTextureLoader";
import { resolvePropSvgPath } from "$lib/shared/animation-engine/services/svg-generator";
import { getTipPointsBaseline } from "$lib/shared/animation-engine/domain/types/prop-tip-points";
import { propTextureMatchesRequest } from "$lib/shared/animation-engine/services/canvas2d/prop-texture-match";
import {
  HOOP_FAMILY_BOXES,
  HOOP_FAMILY_TIP_POINTS,
} from "../hoop-family-geometry.generated";

describe("triangle grip appearance", () => {
  it("defaults to the corner grip and rejects garbage", () => {
    expect(DEFAULT_TRIANGLE_GRIP).toBe("corner");
    expect(normalizeTriangleGrip(undefined)).toBe("corner");
    expect(normalizeTriangleGrip("edge")).toBe("corner");
    expect(normalizeTriangleGrip("side")).toBe("side");
  });

  it("only applies to the triangle", () => {
    expect(isTrianglePropType("triangle")).toBe(true);
    expect(isTrianglePropType("Triangle")).toBe(true);
    expect(isTrianglePropType("minihoop")).toBe(false);
  });

  it("keys the side grip like a fan build", () => {
    expect(resolveTriangleRenderKey("triangle", "corner")).toBe("triangle");
    expect(resolveTriangleRenderKey("triangle", "side")).toBe("triangle__side");
    expect(parseTriangleRenderKey("triangle__side")).toEqual({
      propType: "triangle",
      grip: "side",
    });
    expect(parseTriangleRenderKey("triangle_side")).toEqual({
      propType: "triangle",
      grip: "side",
    });
    expect(parseTriangleRenderKey("triangle")).toBeNull();
    expect(parseTriangleRenderKey("fan__lotus")).toBeNull();
    expect(triangleSpriteKey("corner")).toBe("triangle");
    expect(triangleSpriteKey("side")).toBe("triangle_side");
    expect(triangleAppearanceArtwork("side")).toBe(
      "/images/props/appearances/triangle-side.svg?v=1"
    );
    expect(triangleAppearanceArtwork("corner")).toBeNull();
  });

  it("resolves the render key from the appearance", () => {
    expect(resolvePropRenderKey("triangle", {})).toBe("triangle");
    expect(resolvePropRenderKey("triangle", { triangleGrip: "side" })).toBe(
      "triangle__side"
    );
    // Pinned to whichever the sprite registry actually has today: the glyph
    // key until Task 10 captures the side sprite, then the model key.
    expect(
      resolvePropRenderKey("triangle", {
        triangleGrip: "side",
        propLook: "model",
      })
    ).toBe(
      hasModelSprite("triangle_side")
        ? "triangle_side__model"
        : "triangle__side"
    );
    expect(resolvePropRenderKey("minihoop", { triangleGrip: "side" })).toBe(
      "minihoop"
    );
  });

  it("maps the side grip's sprite key back to the triangle PropType", () => {
    // triangle_side__model splits at "__" to the sprite key "triangle_side",
    // which is not itself a PropType; both this and the glyph key must
    // resolve to "triangle" or the crossfade matcher freezes the prop.
    expect(basePropTypeOfRenderKey("triangle_side__model")).toBe("triangle");
    expect(basePropTypeOfRenderKey("triangle__side")).toBe("triangle");
    expect(
      propTextureMatchesRequest({
        loaded: "triangle_side__model",
        requested: "triangle_side__model",
        paramsPropType: "triangle",
      })
    ).toBe(true);
  });

  it("shares one box and one artwork path per grip", () => {
    const box = getPropDimensions("triangle");
    expect(box).toEqual(HOOP_FAMILY_BOXES.triangle);
    expect(getPropDimensions("triangle__side")).toEqual(box);
    expect(getPropDimensions("triangle_side__model")).toEqual(box);
    expect(resolvePropSvgPath("triangle")).toBe(
      "/images/props/pictograph/triangle.svg"
    );
    expect(resolvePropSvgPath("triangle__side")).toBe(
      "/images/props/appearances/triangle-side.svg?v=1"
    );
  });

  it("gives each grip its own five tips", () => {
    expect(getTipPointsBaseline("triangle").points).toEqual(
      HOOP_FAMILY_TIP_POINTS.triangle
    );
    expect(getTipPointsBaseline("triangle__side").points).toEqual(
      HOOP_FAMILY_TIP_POINTS.triangle_side
    );
    expect(getTipPointsBaseline("triangle_side__model").points).toEqual(
      HOOP_FAMILY_TIP_POINTS.triangle_side
    );
    expect(getTipPointsBaseline("minihoop").points).toEqual(
      HOOP_FAMILY_TIP_POINTS.minihoop
    );
  });
});
