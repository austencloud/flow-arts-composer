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
});
