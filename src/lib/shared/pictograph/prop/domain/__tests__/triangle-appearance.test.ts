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
import { resolvePropRenderKey } from "../prop-look";
import { getPropDimensions } from "$lib/shared/animation-engine/services/IPropTextureLoader";
import { resolvePropSvgPath } from "$lib/shared/animation-engine/services/svg-generator";
import { getTipPointsBaseline } from "$lib/shared/animation-engine/domain/types/prop-tip-points";
import { HOOP_FAMILY_TIP_POINTS } from "../hoop-family-geometry.generated";

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
    // No sprite captured yet: the model look falls back to the glyph key.
    expect(
      resolvePropRenderKey("triangle", {
        triangleGrip: "side",
        propLook: "model",
      })
    ).toMatch(/^triangle(__side|_side__model)$/);
    expect(resolvePropRenderKey("minihoop", { triangleGrip: "side" })).toBe(
      "minihoop"
    );
  });

  it("shares one box and one artwork path per grip", () => {
    const box = getPropDimensions("triangle");
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
