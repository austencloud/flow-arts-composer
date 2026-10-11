import { describe, expect, it, vi } from "vitest";
import fs from "fs";
import { GLOSSARY, LETTER_TYPES } from "@tka/domain";
import { TikaPictographLoader } from "#lib/features/tika/services/tika-pictograph-loader.js";
import { TikaToolExecutor } from "#lib/features/tika/services/tika-tool-executor.js";
import { TikaSequenceGenerator } from "#lib/features/tika/services/tika-sequence-generator.js";
import { TikaSequenceValidator } from "#lib/features/tika/services/tika-sequence-validator.js";

describe("TIKA canonical knowledge loading", () => {
  it("serves glossary and type definitions without retired JSON files", () => {
    const read = vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw new Error("No runtime filesystem");
    });
    try {
      const loader = new TikaPictographLoader();
      expect(loader.getGlossary().pro).toEqual(GLOSSARY.pro);
      expect(loader.getGlossary().pro?.definition.length).toBeGreaterThan(0);
      expect(loader.getLetterTypes()).toEqual(LETTER_TYPES);
      expect(Object.keys(loader.getLetterTypes())).toHaveLength(6);
      expect(read).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
    }
  });

  it("returns the canonical pro definition through the actual chat tool", () => {
    const loader = new TikaPictographLoader();
    const tools = new TikaToolExecutor(
      loader,
      new TikaSequenceGenerator(loader),
      new TikaSequenceValidator(loader)
    );
    const result = tools.getTermDefinition("pro");
    expect(result).toContain(GLOSSARY.pro!.definition);
    const pictograph = loader.getDiamondPictographs()[0];
    expect(pictograph?.leftMotion.hand).toBe("left");
    expect(pictograph?.rightMotion.hand).toBe("right");
  });
});
