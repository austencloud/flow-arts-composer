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
  versionAfterPick,
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
  });

  it("lists Version 1 before Version 2", () => {
    const options = propLookOptions("club");
    expect(options.map((o) => o.id)).toEqual(["pictograph", "model"]);
    expect(options.map((o) => o.label)).toEqual(["Version 1", "Version 2"]);
  });

  it("frames each look card on the painted half of a grip-centred prop", () => {
    const [pictograph, model] = propLookOptions("chicken");
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

describe("version after a pick", () => {
  it("lets a tile that names a version win", () => {
    expect(versionAfterPick("staff", "pictograph", "staff", "model")).toBe(
      "model"
    );
    expect(versionAfterPick("staff", "model", "club", "pictograph")).toBe(
      "pictograph"
    );
    expect(versionAfterPick("staff", "pictograph", "club", "model")).toBe(
      "model"
    );
  });

  it("starts a different prop at Version 1 when the pick names none", () => {
    expect(versionAfterPick("capsule_baton", "model", "club")).toBe(
      "pictograph"
    );
    expect(versionAfterPick(null, "model", "club")).toBe("pictograph");
    expect(versionAfterPick(undefined, "model", "club")).toBe("pictograph");
  });

  it("keeps the version when the prop in hand is picked again", () => {
    expect(versionAfterPick("capsule_baton", "model", "capsule_baton")).toBe(
      "model"
    );
    expect(versionAfterPick("Staff", "model", "staff")).toBe("model");
    expect(versionAfterPick("staff", "pictograph", "staff")).toBe("pictograph");
  });

  it("reads a missing held version as Version 1", () => {
    expect(versionAfterPick("staff", undefined, "staff")).toBe("pictograph");
    expect(versionAfterPick("staff", null, "staff")).toBe("pictograph");
  });

  it("keeps the version across a size change, the same prop", () => {
    expect(versionAfterPick("triad", "model", "bigtriad")).toBe("model");
    expect(versionAfterPick("bigtriad", "model", "triad")).toBe("model");
    expect(versionAfterPick("Staff", "model", "BIGSTAFF")).toBe("model");
    expect(versionAfterPick("triad", "pictograph", "bigtriad")).toBe(
      "pictograph"
    );
  });

  it("keeps the held version when the picked prop has no Version 2", () => {
    // Fan has none, so there is nothing for the pick to reset to.
    expect(versionAfterPick("staff", "model", "fan")).toBe("model");
    expect(versionAfterPick("staff", "model", "bigfan")).toBe("model");
    // A prop that does have one still starts at Version 1.
    expect(versionAfterPick("staff", "model", "club")).toBe("pictograph");
    expect(versionAfterPick("fan", "model", "club")).toBe("pictograph");
  });
});
