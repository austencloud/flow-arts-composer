import { describe, expect, it } from "vitest";
import { propTileArtwork, propGlyphArtwork } from "../prop-look";

const glyph = "/images/props/buttons/x.svg";

describe("navigation prop artwork", () => {
  it.each(["fan", "bigfan"])(
    "keeps flat grips in both %s glyphs without substituting a tile photo",
    (type) => {
      const appearance = {
        fanAppearance: {
          build: "flat-grip" as const,
          frameColor: "black" as const,
          cover: "bare" as const,
        },
      };
      for (const side of ["left", "right"] as const) {
        const art = propGlyphArtwork(type, side, appearance, glyph);
        expect(art.href).toContain("fan-flat-grip.svg");
        expect(art.fill).toBeUndefined();
        expect(art.prelit).toBe(false);
        expect(art.crop!.x).toBeGreaterThan(0);
      }
    }
  );

  it("keeps the cover and notation choices distinct", () => {
    const fanAppearance = {
      build: "fire" as const,
      frameColor: "black" as const,
      cover: "covered" as const,
    };
    expect(
      propGlyphArtwork("fan", "left", { fanAppearance }, glyph).href
    ).toContain("fan-fire-covered.svg");
    expect(
      propGlyphArtwork(
        "fan",
        "left",
        { fanAppearance: { ...fanAppearance, build: "pictograph" } },
        glyph
      ).href
    ).toBe(glyph);
  });

  it.each([
    "chicken",
    "guitar",
    "ukulele",
    "triquetra",
    "contactball",
    "bigcontactball",
  ])(
    "centers %s on its painted half without changing the picker artwork",
    (type) => {
      const crop = propGlyphArtwork(type, "left", {}, glyph).crop!;
      expect(crop.x).toBeGreaterThan(crop.imageWidth * 0.2);
      expect(crop.width).toBeLessThan(crop.imageWidth * 0.8);
      expect(propTileArtwork(type, "left", {}, glyph).crop).toBeUndefined();
    }
  );

  it("uses each notation fan's own canvas instead of the physical fan crop", () => {
    const fanAppearance = {
      build: "pictograph" as const,
      frameColor: "black" as const,
      cover: "bare" as const,
    };
    const small = propGlyphArtwork(
      "fan",
      "left",
      { fanAppearance },
      glyph
    ).crop!;
    const big = propGlyphArtwork(
      "bigfan",
      "left",
      { fanAppearance },
      glyph
    ).crop!;
    expect(big.imageWidth).toBeGreaterThan(small.imageWidth);
    expect(big.imageHeight).toBeGreaterThan(small.imageHeight);
    expect(big).not.toEqual(propGlyphArtwork("bigfan", "left", {}, glyph).crop);
  });
});

describe("propTileArtwork", () => {
  it("uses the notation glyph for a prop with no build or grip", () => {
    expect(propTileArtwork("club", "left", {}, glyph)).toEqual({
      href: glyph,
      styled: false,
      prelit: false,
    });
    expect(propTileArtwork("energy_saber", "left", {}, glyph).href).toBe(glyph);
  });

  it("swaps in the side glyph for a side-grip triangle", () => {
    const side = propTileArtwork(
      "triangle",
      "left",
      { triangleGrip: "side" as const },
      glyph
    );
    expect(side.href).toContain("triangle-side.svg");
    expect(side).toMatchObject({ styled: false, prelit: false });
    expect(
      propGlyphArtwork(
        "triangle",
        "left",
        { triangleGrip: "side" as const },
        glyph
      ).href
    ).toContain("triangle-side.svg");
  });

  it("keeps the fallback glyph for a corner-grip triangle or no grip set", () => {
    expect(
      propTileArtwork(
        "triangle",
        "left",
        { triangleGrip: "corner" as const },
        glyph
      ).href
    ).toBe(glyph);
    expect(propTileArtwork("triangle", "left", {}, glyph).href).toBe(glyph);
    expect(
      propGlyphArtwork(
        "triangle",
        "left",
        { triangleGrip: "corner" as const },
        glyph
      ).href
    ).toBe(glyph);
    expect(propGlyphArtwork("triangle", "left", {}, glyph).href).toBe(glyph);
  });

  it("draws the rendered preview of the chosen fan build", () => {
    const fire = propTileArtwork("bigfan", "right", {}, glyph);
    expect(fire.href).toMatch(/build-previews\/fan-fire-bare-complete\.webp/);
    expect(fire).toMatchObject({ styled: true, prelit: true });
    expect(
      propTileArtwork(
        "fan",
        "left",
        {
          fanAppearance: {
            build: "pictograph",
            frameColor: "black",
            cover: "bare",
          },
        },
        glyph
      ).href
    ).toBe(glyph);
  });
});
