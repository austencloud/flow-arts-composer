import { describe, it, expect } from "vitest";
import {
  getSheetPageLayout,
  pageChromePt,
  RUNNING_HEADER_PT,
  TITLE_BLOCK_PT,
} from "#lib/features/write/domain/sheet-page-layout.js";
import { DEFAULT_SHEET_LAYOUT } from "#lib/features/write/domain/types/choreo-sheet.js";

const base = { ...DEFAULT_SHEET_LAYOUT };

describe("sheet geometry — orientation + annotation bands", () => {
  it("landscape is 792x612, portrait is 612x792", () => {
    const land = getSheetPageLayout({ ...base, orientation: "landscape" });
    const port = getSheetPageLayout({ ...base, orientation: "portrait" });
    expect([land.pageWidthPt, land.pageHeightPt]).toEqual([792, 612]);
    expect([port.pageWidthPt, port.pageHeightPt]).toEqual([612, 792]);
  });

  it("cue rail reserves left width only when showCueRail is on", () => {
    const off = getSheetPageLayout({ ...base, showCueRail: false });
    const on = getSheetPageLayout({ ...base, showCueRail: true });
    expect(off.railWidthPt).toBe(0);
    expect(on.railWidthPt).toBeGreaterThan(40);
    // rail eats into cell width
    expect(on.cellSizePt).toBeLessThan(off.cellSizePt);
  });

  it("note strips add base strip height only when showNoteStrips is on", () => {
    const off = getSheetPageLayout({ ...base, showNoteStrips: false });
    const on = getSheetPageLayout({ ...base, showNoteStrips: true });
    expect(off.stripBaseHeightPt).toBe(0);
    expect(on.stripBaseHeightPt).toBeCloseTo(on.cellSizePt * 0.5, 5);
  });

  it("exposes usableHeightPt for height-packed pagination", () => {
    const geo = getSheetPageLayout(base);
    expect(geo.usableHeightPt).toBeGreaterThan(0);
    expect(geo.usableHeightPt).toBeLessThan(geo.pageHeightPt);
  });

  it("reserves the title block on page 1 and the running header after", () => {
    expect(pageChromePt(0, true)).toBe(TITLE_BLOCK_PT);
    expect(pageChromePt(0, false)).toBe(0);
    expect(pageChromePt(1, true)).toBe(RUNNING_HEADER_PT);
    expect(pageChromePt(3, false)).toBe(RUNNING_HEADER_PT);
  });
});

import {
  buildBands,
  planBands,
  planSheet,
  type BandPlanInput,
} from "#lib/features/write/services/sheet-row-planner.js";
import { buildActSequence } from "#lib/features/write/services/sheet-act-sequence.js";
import { bandKey } from "#lib/features/write/domain/types/choreo-sheet.js";

function seq(id: string, n: number) {
  return { id, steps: Array.from({ length: n }, (_, i) => ({ stepNumber: i + 1, letter: "A" })) } as any;
}

describe("planBands (row-aligned)", () => {
  const geo = getSheetPageLayout({ ...base, orientation: "landscape", showCueRail: true, showNoteStrips: true });

  it("chunks a 12-step sequence into 2 bands of 8 + 4, keyed by rowInSequence", () => {
    const input: BandPlanInput = { sequences: [seq("x", 12)], geo, cues: [], notes: [] };
    const pages = planBands(input);
    const bands = pages.flatMap((p) => p.bands);
    expect(bands.length).toBe(2);
    expect(bands[0].key).toBe(bandKey(0, "x", 0));
    expect(bands[0].cells.length).toBe(8);
    expect(bands[1].key).toBe(bandKey(0, "x", 1));
    expect(bands[1].cells.length).toBe(4); // short last row, NOT cross-padded
    expect(bands[0].isSequenceStart).toBe(true);
    expect(bands[1].isSequenceStart).toBe(false);
  });

  it("each sequence starts a fresh band (no straddling)", () => {
    const input: BandPlanInput = { sequences: [seq("x", 4), seq("y", 4)], geo, cues: [], notes: [] };
    const bands = planBands(input).flatMap((p) => p.bands);
    expect(bands.length).toBe(2);
    expect(bands[0].key).toBe(bandKey(0, "x", 0));
    expect(bands[1].key).toBe(bandKey(1, "y", 0));
    expect(bands[1].isSequenceStart).toBe(true);
  });

  it("gives the same sequence listed twice DISTINCT band keys", () => {
    // A roster may legitimately hold one sequence twice. Keying on
    // sequenceId:row alone collided, and the keyed {#each} over bands threw
    // each_key_duplicate — which killed the reactive update and froze the
    // preview mid-render.
    const bands = planBands({
      sequences: [seq("dup", 8), seq("other", 8), seq("dup", 8)],
      geo,
      cues: [],
      notes: [],
    }).flatMap((p) => p.bands);

    const keys = bands.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("shows a repeated sequence's annotations on BOTH of its rows", () => {
    // The note describes the sequence, so every occurrence of that sequence
    // carries it. Distinct keys, same annotation — that is the intended pair.
    const notes = [{ id: "n1", sequenceId: "dup", stepIndex: 2, pinned: true, text: "roll" }];
    const bands = planBands({
      sequences: [seq("dup", 8), seq("dup", 8)],
      geo,
      cues: [],
      notes,
    }).flatMap((p) => p.bands);

    expect(bands).toHaveLength(2);
    expect(bands[0].notes.map((n) => n.count)).toEqual([3]);
    expect(bands[1].notes.map((n) => n.count)).toEqual([3]);
    expect(bands[0].key).not.toBe(bands[1].key);
  });

  it("resolves cue + notes onto their band from the absolute step index", () => {
    // step 8 is the first step of row 1 at 8 columns; step 4 is count 5 of row 0.
    const cues = [{ sequenceId: "x", stepIndex: 8, timestamp: "0:08", text: "drop" }];
    const notes = [{ id: "n1", sequenceId: "x", stepIndex: 4, pinned: true, text: "pack bags" }];
    const bands = planBands({ sequences: [seq("x", 12)], geo, cues, notes }).flatMap((p) => p.bands);
    expect(bands[0].notes).toHaveLength(1);
    expect(bands[0].notes[0].text).toBe("pack bags");
    expect(bands[0].notes[0].count).toBe(5);
    expect(bands[0].cues).toHaveLength(0);
    expect(bands[1].cues[0]?.text).toBe("drop");
  });

  it("keeps a note on its step when the pictograph size changes", () => {
    // THE regression: a note used to store (band, count). Band 0 count 5 means
    // step 4 at 8 columns but step 4 lives in band 1 at 4 columns, so the note
    // silently unpinned into a full-width bullet on an unrelated row.
    const notes = [{ id: "n1", sequenceId: "x", stepIndex: 4, pinned: true, text: "left thumb roll" }];
    const at = (columns: number) =>
      planBands({
        sequences: [seq("x", 12)],
        geo: getSheetPageLayout({ ...base, columns, showCueRail: true, showNoteStrips: true }),
        cues: [],
        notes,
      }).flatMap((p) => p.bands);

    const wide = at(8).find((b) => b.notes.length > 0)!;
    expect(wide.rowInSequence).toBe(0);
    expect(wide.notes[0].count).toBe(5); // 5th cell of an 8-wide row

    const narrow = at(4).find((b) => b.notes.length > 0)!;
    expect(narrow.rowInSequence).toBe(1); // re-chunked onto row 1
    expect(narrow.notes[0].count).toBe(1); // still step 4 — now the 1st cell
    expect(narrow.notes[0].text).toBe("left thumb roll"); // and still pinned, not demoted
  });

  it("stacks both cues when widening the size merges their rows", () => {
    // At 4 columns steps 0 and 4 start two different rows, each with its own
    // cue. At 8 columns they share one band — both cues must survive.
    const cues = [
      { sequenceId: "x", stepIndex: 0, timestamp: "0:00", text: "verse" },
      { sequenceId: "x", stepIndex: 4, timestamp: "0:04", text: "drop" },
    ];
    const narrow = planBands({
      sequences: [seq("x", 8)],
      geo: getSheetPageLayout({ ...base, columns: 4, showCueRail: true }),
      cues,
      notes: [],
    }).flatMap((p) => p.bands);
    expect(narrow.map((b) => b.cues.length)).toEqual([1, 1]);

    const wide = planBands({
      sequences: [seq("x", 8)],
      geo: getSheetPageLayout({ ...base, columns: 8, showCueRail: true }),
      cues,
      notes: [],
    }).flatMap((p) => p.bands);
    expect(wide).toHaveLength(1);
    expect(wide[0].cues.map((c) => c.text)).toEqual(["verse", "drop"]); // earliest first
  });

  it("keeps an annotation visible when its sequence was shortened", () => {
    // stepIndex 30 no longer exists in a 12-step sequence. It clamps onto the
    // last band as a bullet rather than vanishing without a trace.
    const notes = [{ id: "n1", sequenceId: "x", stepIndex: 30, pinned: true, text: "orphan" }];
    const bands = planBands({ sequences: [seq("x", 12)], geo, cues: [], notes }).flatMap((p) => p.bands);
    const holder = bands.find((b) => b.notes.length > 0)!;
    expect(holder.rowInSequence).toBe(1); // last band
    expect(holder.notes[0].count).toBeNull(); // demoted to a bullet, still shown
  });

  it("drops annotations whose sequence is no longer on the sheet", () => {
    const notes = [{ id: "n1", sequenceId: "gone", stepIndex: 0, pinned: true, text: "stale" }];
    const bands = planBands({ sequences: [seq("x", 8)], geo, cues: [], notes }).flatMap((p) => p.bands);
    expect(bands.flatMap((b) => b.notes)).toHaveLength(0);
  });

  it("buildBands is exactly planBands minus pagination", () => {
    // The extraction that lets the reading view re-chunk without a second
    // implementation. If these ever diverge, the two surfaces have forked.
    const input: BandPlanInput = {
      sequences: [seq("x", 12), seq("y", 8)],
      geo,
      cues: [{ sequenceId: "x", stepIndex: 8, timestamp: "0:08", text: "drop" }],
      notes: [{ id: "n1", sequenceId: "y", stepIndex: 3, pinned: true, text: "roll" }],
    };
    expect(buildBands(input)).toEqual(planBands(input).flatMap((p) => p.bands));
  });

  it("re-chunks at a reading column count without disturbing annotations", () => {
    // What the phone view does: same bands, its own width. A note on step 6
    // must land on the pictograph labelled 6 at every count.
    const notes = [{ id: "n1", sequenceId: "x", stepIndex: 6, pinned: true, text: "pass behind" }];
    const at = (columns: number) => {
      const bands = buildBands({
        sequences: [seq("x", 16)],
        geo: getSheetPageLayout({ ...base, columns, showCueRail: true, showNoteStrips: true }),
        cues: [],
        notes,
      });
      const holder = bands.find((b) => b.notes.length > 0)!;
      // Absolute step the badge resolves to, which must be stable.
      return holder.firstStepIndex + (holder.notes[0].count! - 1);
    };
    expect(at(8)).toBe(6);
    expect(at(4)).toBe(6);
    expect(at(6)).toBe(6);
  });

  it("stamps every cell with its position in the ACT, matching buildActSequence", () => {
    // The playback highlight compares the act player's reported step directly
    // against cell.actStepIndex, so the two numberings must agree exactly. If
    // buildActSequence's concatenation order ever changes, this fails.
    const rows = [seq("x", 12), seq("y", 4), seq("z", 8)];
    const act = buildActSequence(rows, "act")!;

    const bandCells = buildBands({ sequences: rows, geo, cues: [], notes: [] })
      .flatMap((b) => b.cells)
      .filter((c) => !c.isBlank);
    expect(bandCells.map((c) => c.actStepIndex)).toEqual(act.steps.map((_, i) => i));

    // The flow branch lays the same stream out differently but must agree.
    const flowCells = planSheet(rows, { ...base, columns: 8 })
      .flatMap((p) => p.rows)
      .flatMap((r) => r.cells)
      .filter((c) => !c.isBlank);
    expect(flowCells.map((c) => c.actStepIndex)).toEqual(act.steps.map((_, i) => i));
  });

  it("leaves pad cells with no act position", () => {
    // A trailing blank is not a step and must never match the playhead.
    const pads = planSheet([seq("x", 5)], { ...base, columns: 8 })
      .flatMap((p) => p.rows)
      .flatMap((r) => r.cells)
      .filter((c) => c.isBlank);
    expect(pads.length).toBeGreaterThan(0);
    expect(pads.every((c) => c.actStepIndex === null)).toBe(true);
  });

  it("packs bands onto pages by height and overflows to a new page", () => {
    // 40 sequences of 8 steps each = 40 bands; landscape usableHeight fits ~4.
    const many = Array.from({ length: 40 }, (_, i) => seq(`s${i}`, 8));
    const pages = planBands({ sequences: many, geo, cues: [], notes: [] });
    expect(pages.length).toBeGreaterThan(1);
    // Every page's band height plus the gaps drawn between them must fit.
    for (const page of pages) {
      const sum = page.bands.reduce((h, b) => h + b.heightPt, 0);
      const gaps = Math.max(0, page.bands.length - 1) * geo.interBandGutterPt;
      expect(sum + gaps).toBeLessThanOrEqual(geo.usableHeightPt + 0.01);
    }
  });

  it("fits four compact annotated strips below the landscape title block", () => {
    const compact = getSheetPageLayout({
      ...base,
      orientation: "landscape",
      columns: 8,
      showCueRail: false,
      showNoteStrips: false,
    });
    const pages = planBands({
      sequences: Array.from({ length: 4 }, (_, i) => seq(`s${i}`, 8)),
      geo: compact,
      cues: [],
      notes: [],
    });

    expect(pages).toHaveLength(1);
    expect(pages[0].bands).toHaveLength(4);
  });

  it("leaves room for the page chrome — bands never run past the bottom margin", () => {
    // The regression: page 1 carries a ~186pt title block, and budgeting the
    // whole page for bands pushed the last row off the bottom in portrait.
    const portrait = getSheetPageLayout({ ...base, orientation: "portrait", columns: 8 });
    const many = Array.from({ length: 30 }, (_, i) => seq(`s${i}`, 8));
    const pages = planBands({ sequences: many, geo: portrait, cues: [], notes: [] });

    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      const chrome = pageChromePt(page.pageIndex, true);
      const sum = page.bands.reduce((h, b) => h + b.heightPt, 0);
      const gaps = Math.max(0, page.bands.length - 1) * portrait.interBandGutterPt;
      expect(chrome).toBeGreaterThan(0);
      expect(sum + gaps + chrome).toBeLessThanOrEqual(portrait.usableHeightPt + 0.01);
    }
  });

  it("gives page 1 the extra room back when the title block is off", () => {
    const portrait = getSheetPageLayout({ ...base, orientation: "portrait", columns: 8 });
    const many = Array.from({ length: 30 }, (_, i) => seq(`s${i}`, 8));
    const withTitle = planBands({ sequences: many, geo: portrait, cues: [], notes: [] });
    const without = planBands({
      sequences: many,
      geo: portrait,
      cues: [],
      notes: [],
      showTitleBlock: false,
    });
    expect(without[0]!.bands.length).toBeGreaterThan(withTitle[0]!.bands.length);
  });
});
