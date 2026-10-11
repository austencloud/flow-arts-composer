import { describe, expect, it } from "vitest";
import { getScanLoaderBaseLetters } from "#lib/shared/sequence-viewer/services/scan-sequence-loader.js";

describe("getScanLoaderBaseLetters", () => {
  it("deduplicates rendered base glyphs while preserving word order", () => {
    expect(getScanLoaderBaseLetters("CAKE")).toEqual(["C", "A", "K", "E"]);
    expect(getScanLoaderBaseLetters("MOM")).toEqual(["M", "O"]);
  });

  it("loads the base glyph for dash letters", () => {
    expect(getScanLoaderBaseLetters("AW-B")).toEqual(["A", "W", "B"]);
  });
});
