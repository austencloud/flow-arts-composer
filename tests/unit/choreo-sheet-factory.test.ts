import { describe, it, expect } from "vitest";
import { createEmptyChoreoSheet, DEFAULT_SHEET_LAYOUT } from "#lib/features/write/domain/types/choreo-sheet.js";

describe("createEmptyChoreoSheet", () => {
  it("creates a sheet with default layout and the given owner/name", () => {
    const sheet = createEmptyChoreoSheet("user-1", "My Sheet");
    expect(sheet.ownerId).toBe("user-1");
    expect(sheet.name).toBe("My Sheet");
    expect(sheet.sequenceIds).toEqual([]);
    expect(sheet.layout).toEqual(DEFAULT_SHEET_LAYOUT);
    expect(sheet.id).toMatch(/.+/);
    expect(sheet.createdAt).toBeInstanceOf(Date);
  });

  it("defaults to 8 columns, 6 rows/page, landscape letter, step numbers on, rule separator", () => {
    expect(DEFAULT_SHEET_LAYOUT).toEqual({
      columns: 8,
      rowsPerPage: 6,
      paperSize: "letter",
      orientation: "landscape",
      showStepNumbers: true,
      groupSeparator: "rule",
      keepBlocksTogether: true,
      // Annotation-model layout knobs (578df5229d): "flow" is the dense study
      // sheet; the cue rail and note strips are the Annotated-mode chrome and
      // stay off until the user turns them on.
      packing: "flow",
      showCueRail: false,
      showNoteStrips: false,
    });
  });
});
