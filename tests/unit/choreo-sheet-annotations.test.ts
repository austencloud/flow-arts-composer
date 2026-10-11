import { describe, it, expect } from "vitest";
import {
  bandKey,
  createEmptyAnnotations,
  DEFAULT_SHEET_LAYOUT,
  createEmptyChoreoSheet,
} from "#lib/features/write/domain/types/choreo-sheet.js";

describe("choreo-sheet annotations model", () => {
  it("bandKey composes rosterIndex + sequenceId + rowInSequence", () => {
    expect(bandKey(0, "abc", 0)).toBe("0:abc:0");
    expect(bandKey(0, "abc", 2)).toBe("0:abc:2");
  });

  it("bandKey separates two roster rows holding the same sequence", () => {
    expect(bandKey(0, "abc", 0)).not.toBe(bandKey(1, "abc", 0));
  });

  it("createEmptyAnnotations has empty cues/notes and a header with title block on", () => {
    const a = createEmptyAnnotations();
    expect(a.cues).toEqual([]);
    expect(a.notes).toEqual([]);
    expect(a.header.showTitleBlock).toBe(true);
  });

  it("default layout is flow-packed landscape with rail/strips off (back-compat)", () => {
    expect(DEFAULT_SHEET_LAYOUT.orientation).toBe("landscape");
    expect(DEFAULT_SHEET_LAYOUT.packing).toBe("flow");
    expect(DEFAULT_SHEET_LAYOUT.showCueRail).toBe(false);
    expect(DEFAULT_SHEET_LAYOUT.showNoteStrips).toBe(false);
  });

  it("a new sheet carries empty annotations", () => {
    const sheet = createEmptyChoreoSheet("owner-1");
    expect(sheet.annotations.cues).toEqual([]);
    expect(sheet.annotations.header.showTitleBlock).toBe(true);
  });
});

import { createChoreoSheetState } from "#lib/features/write/state/choreo-sheet-state.svelte.js";

function makeState() {
  return createChoreoSheetState({
    resolveSequence: async () => ({
      sequence: null,
      source: null,
      failure: "missing" as const,
      attempts: 1,
    }),
  });
}

describe("annotation editing on the state factory", () => {
  it("setHeader patches header fields and marks dirty", () => {
    const s = makeState();
    expect(s.isDirty).toBe(false);
    s.setHeader({ songName: "1940" });
    expect(s.sheet.annotations.header.songName).toBe("1940");
    expect(s.isDirty).toBe(true);
  });

  it("addNote then setNote then removeNote round-trips", () => {
    const s = makeState();
    const id = s.addNote("x", 4, true);
    expect(s.sheet.annotations.notes).toHaveLength(1);
    expect(s.sheet.annotations.notes[0]).toMatchObject({ sequenceId: "x", stepIndex: 4, pinned: true });
    s.setNote(id, { text: "pack bags" });
    expect(s.sheet.annotations.notes[0].text).toBe("pack bags");
    s.removeNote(id);
    expect(s.sheet.annotations.notes).toHaveLength(0);
  });

  it("setCue upserts by (sequence, step) — a second patch edits, not appends", () => {
    const s = makeState();
    s.setCue("x", 8, { timestamp: "0:08", text: "drop" });
    expect(s.sheet.annotations.cues).toHaveLength(1);
    s.setCue("x", 8, { text: "drop harder" });
    expect(s.sheet.annotations.cues).toHaveLength(1);
    expect(s.sheet.annotations.cues[0].text).toBe("drop harder");
    expect(s.sheet.annotations.cues[0].timestamp).toBe("0:08");
  });

  it("setCue keeps cues on different steps of the same sequence apart", () => {
    const s = makeState();
    s.setCue("x", 0, { text: "verse" });
    s.setCue("x", 8, { text: "drop" });
    expect(s.sheet.annotations.cues.map((c) => c.text)).toEqual(["verse", "drop"]);
  });
});

import { parseChoreoSheet } from "#lib/features/write/services/choreo-sheet-repository.js";

describe("choreo-sheet persistence back-compat", () => {
  it("hydrates a pre-annotation sheet to flow mode with empty annotations", () => {
    const legacy = {
      id: "s1",
      name: "Old",
      ownerId: "u1",
      sequenceIds: ["a", "b"],
      layout: { columns: 8, rowsPerPage: 6, paperSize: "letter", orientation: "landscape", showStepNumbers: true, groupSeparator: "rule", keepBlocksTogether: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const sheet = parseChoreoSheet(legacy);
    expect(sheet.annotations.cues).toEqual([]);
    expect(sheet.layout.packing).toBe("flow");
    expect(sheet.layout.showCueRail).toBe(false);
  });

  it("round-trips annotations", () => {
    const withAnn = {
      id: "s2", name: "New", ownerId: "u1", sequenceIds: ["a"],
      layout: { columns: 8, rowsPerPage: 6, paperSize: "letter", orientation: "portrait", packing: "aligned", showStepNumbers: true, groupSeparator: "rule", keepBlocksTogether: true, showCueRail: true, showNoteStrips: true },
      annotations: { cues: [{ band: "a:0", timestamp: "0:00", text: "hi" }], notes: [{ id: "n1", band: "a:0", count: 5, text: "note" }], header: { showTitleBlock: true, songName: "X" } },
      bpm: 120,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const sheet = parseChoreoSheet(withAnn);
    expect(sheet.annotations.cues[0].text).toBe("hi");
    expect(sheet.layout.packing).toBe("aligned");
    expect(sheet.bpm).toBe(120);
  });

  it("migrates band-relative annotations onto absolute steps using the SAVED columns", () => {
    // The doc's own layout is the only surviving record of the width its
    // annotations were written against, so the conversion happens on load.
    const saved = {
      id: "s3", name: "Legacy notes", ownerId: "u1", sequenceIds: ["a"],
      layout: { columns: 4, rowsPerPage: 3, paperSize: "letter", orientation: "landscape", packing: "aligned", showStepNumbers: true, groupSeparator: "rule", keepBlocksTogether: true, showCueRail: true, showNoteStrips: true },
      annotations: {
        cues: [{ band: "a:2", timestamp: "0:16", text: "drop" }],
        notes: [
          { id: "n1", band: "a:1", count: 3, text: "left thumb roll" },
          { id: "n2", band: "a:1", count: null, text: "breathe" },
        ],
        header: { showTitleBlock: true },
      },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const sheet = parseChoreoSheet(saved);

    // 4 columns: band 2 starts at step 8; band 1 count 3 is step 4+2 = 6.
    expect(sheet.annotations.cues[0]).toMatchObject({ sequenceId: "a", stepIndex: 8, text: "drop" });
    expect(sheet.annotations.notes[0]).toMatchObject({ sequenceId: "a", stepIndex: 6, pinned: true });
    // A bullet had no column, so it anchors to its row's first step.
    expect(sheet.annotations.notes[1]).toMatchObject({ stepIndex: 4, pinned: false });
  });

  it("leaves already-migrated annotations alone", () => {
    const current = {
      id: "s4", name: "Current", ownerId: "u1", sequenceIds: ["a"],
      layout: { columns: 8, rowsPerPage: 6, paperSize: "letter", orientation: "landscape", packing: "aligned", showStepNumbers: true, groupSeparator: "rule", keepBlocksTogether: true, showCueRail: true, showNoteStrips: true },
      annotations: {
        cues: [{ sequenceId: "a", stepIndex: 3, timestamp: "0:03", text: "hit" }],
        notes: [{ id: "n1", sequenceId: "a", stepIndex: 9, pinned: true, text: "roll" }],
        header: { showTitleBlock: true },
      },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const sheet = parseChoreoSheet(current);
    expect(sheet.annotations.cues[0]).toMatchObject({ stepIndex: 3, text: "hit" });
    expect(sheet.annotations.notes[0]).toMatchObject({ stepIndex: 9, pinned: true });
  });
});
