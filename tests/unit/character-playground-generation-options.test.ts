import { describe, expect, it } from "vitest";
import {
  DEFAULT_GENERATION_OPTIONS,
  parseGenerationOptions,
} from "../../src/routes/test/character-playground/generation-options";

describe("character playground generation options", () => {
  it("keeps a valid resolved creator setup intact", () => {
    expect(parseGenerationOptions(DEFAULT_GENERATION_OPTIONS)).toEqual(
      DEFAULT_GENERATION_OPTIONS
    );
  });

  it("rejects cross-presentation outfits and unquantized controls", () => {
    expect(
      parseGenerationOptions({
        ...DEFAULT_GENERATION_OPTIONS,
        outfit: "male_casualsuit01",
      })
    ).toBeNull();
    expect(
      parseGenerationOptions({ ...DEFAULT_GENERATION_OPTIONS, face: 0.13 })
    ).toBeNull();
  });

  it("accepts zero as a meaningful face-variation setting", () => {
    expect(
      parseGenerationOptions({ ...DEFAULT_GENERATION_OPTIONS, face: 0 })
    ).toMatchObject({ face: 0 });
  });

  it("fills new appearance controls for a saved legacy creator request", () => {
    const {
      shoes,
      hat,
      eyebrows,
      eyelashes,
      eyeColor,
      hairColorOverride,
      outfitColorOverride,
      ...legacy
    } = DEFAULT_GENERATION_OPTIONS;
    expect(parseGenerationOptions(legacy)).toEqual(DEFAULT_GENERATION_OPTIONS);
  });

  it("keeps asset paths and malformed color values out of the generator", () => {
    expect(
      parseGenerationOptions({
        ...DEFAULT_GENERATION_OPTIONS,
        shoes: "../../shoes01",
      })
    ).toBeNull();
    expect(
      parseGenerationOptions({
        ...DEFAULT_GENERATION_OPTIONS,
        outfitColorOverride: "blue",
      })
    ).toBeNull();
  });

  it("accepts bounded reproducibility seeds and rejects fractional values", () => {
    expect(
      parseGenerationOptions({
        ...DEFAULT_GENERATION_OPTIONS,
        variationSeed: 0,
        faceSeed: 2147483647,
      })
    ).toMatchObject({ variationSeed: 0, faceSeed: 2147483647 });
    expect(
      parseGenerationOptions({ ...DEFAULT_GENERATION_OPTIONS, faceSeed: 0.5 })
    ).toBeNull();
  });
});
