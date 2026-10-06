import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROP_LOOK,
  basePropTypeOfRenderKey,
  hasModelSprite,
  modelSpriteArtwork,
  normalizePropLook,
  parseModelRenderKey,
  propArtworkStem,
  propLookOptions,
  resolvePropRenderKey,
} from "../prop-look";
import { PROP_MODEL_SPRITES } from "../prop-model-sprites.generated";

describe("prop look", () => {
  it("defaults to the canonical pictograph look", () => {
    expect(DEFAULT_PROP_LOOK).toBe("pictograph");
    expect(normalizePropLook(undefined)).toBe("pictograph");
    expect(normalizePropLook("garbage")).toBe("pictograph");
    expect(normalizePropLook("model")).toBe("model");
  });

  it("has a captured sprite pair for every physical 3D prop", () => {
    for (const prop of ["staff", "club", "sword", "buugeng", "poi", "torch"]) {
      expect(hasModelSprite(prop), prop).toBe(true);
    }
    expect(hasModelSprite("fan")).toBe(false);
    expect(hasModelSprite("hand")).toBe(false);
    expect(hasModelSprite("energy_saber")).toBe(false);
    expect(Object.keys(PROP_MODEL_SPRITES).length).toBeGreaterThanOrEqual(30);
  });

  it("resolves model render keys only for sprites that exist", () => {
    expect(resolvePropRenderKey("staff", {})).toBe("staff");
    expect(resolvePropRenderKey("Staff", { propLook: "model" })).toBe(
      "staff__model"
    );
    expect(resolvePropRenderKey("staff", { propLook: "pictograph" })).toBe(
      "staff"
    );
    expect(resolvePropRenderKey("energy_saber", {})).toBe("energy_saber");
    expect(resolvePropRenderKey("hand", {})).toBe("hand");
  });

  it("lets the fan appearance contract win for fans", () => {
    expect(resolvePropRenderKey("fan", {})).toBe("fan__fire_bare");
    expect(
      resolvePropRenderKey("bigfan", {
        fanAppearance: {
          build: "pictograph",
          frameColor: "black",
          cover: "bare",
        },
      })
    ).toBe("bigfan");
  });

  it("parses and strips render keys", () => {
    expect(parseModelRenderKey("club__model")).toEqual({ propType: "club" });
    expect(parseModelRenderKey("club")).toBeNull();
    expect(parseModelRenderKey("fan__fire_bare")).toBeNull();
    expect(basePropTypeOfRenderKey("club__model")).toBe("club");
    expect(basePropTypeOfRenderKey("fan__fire_bare")).toBe("fan");
    expect(basePropTypeOfRenderKey("staff")).toBe("staff");
  });

  it("points each hand at its own pre-lit sprite", () => {
    expect(modelSpriteArtwork("staff", "left")).toMatch(
      /^\/images\/props\/appearances\/model\/staff-blue\.svg\?v=/
    );
    expect(modelSpriteArtwork("staff", "right")).toMatch(
      /^\/images\/props\/appearances\/model\/staff-red\.svg\?v=/
    );
    expect(propLookOptions("club").map((o) => o.id)).toEqual([
      "model",
      "pictograph",
    ]);
  });

  it("frames each look card on the painted half of a grip-centred prop", () => {
    const [model, pictograph] = propLookOptions("chicken");
    const sprite = PROP_MODEL_SPRITES.chicken!;
    // The capture paints only the left half of its 325-wide box and the
    // notation glyph only the right half; uncropped, both cards sat off-centre.
    expect(model?.crop).toMatchObject(sprite.bounds!);
    expect(model?.crop?.width).toBeLessThan(sprite.width / 2);
    expect(pictograph?.crop?.x).toBeGreaterThan(
      pictograph!.crop!.imageWidth / 3
    );
    expect(pictograph?.crop?.width).toBeLessThan(pictograph!.crop!.imageWidth);
  });
});

describe("prop artwork per hand", () => {
  it("gives the right hand its own stick and shares every other drawing", () => {
    expect(propArtworkStem("stick", "left")).toBe("stick");
    expect(propArtworkStem("stick", "right")).toBe("stick-right");
    expect(propArtworkStem("staff", "right")).toBe("staff");
    expect(propArtworkStem("fire_double_staff", "right")).toBe(
      "fire_double_staff"
    );
  });
});
