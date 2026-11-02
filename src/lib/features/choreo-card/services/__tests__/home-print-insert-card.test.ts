// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { PDFDocument, PrintScaling } from "pdf-lib";
import {
  exportCalibrationPDF,
  exportFixedSheetBatchPDF,
  exportHomePrintPDF,
} from "../print-pdf-exporter";
import type { CardPair } from "../types";

/**
 * The insert leads the home-print run on its own sheet, once PER COPY.
 * Printing 3 copies produces 3 physical decks, so 3 inserts — a single insert
 * page at the front of the document would leave two decks unteachable.
 *
 * Sheet arithmetic (poker, 9 per sheet), combined mode:
 *   pages = frontSheets + 1 flip separator + backSheets
 */

// 1×1 transparent PNG — pdf-lib needs real image bytes to embed.
const PNG_1X1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function fakeCanvas(): HTMLCanvasElement {
  return { toDataURL: () => PNG_1X1 } as unknown as HTMLCanvasElement;
}

function pair(label: string): CardPair {
  return { front: fakeCanvas(), back: fakeCanvas(), label };
}

async function pageCount(blob: Blob): Promise<number> {
  const doc = await PDFDocument.load(await blob.arrayBuffer());
  return doc.getPageCount();
}

describe("exportHomePrintPDF with the How to Read insert", () => {
  it("adds one leading sheet pair when copies fit a single sheet", async () => {
    const pairs = [pair("ABC"), pair("DEF")];
    const opts = { copies: 3, groupByElement: false };

    // 2 cards × 3 copies = 6 slots → 1 sheet. Insert: 3 → 1 sheet.
    const without = await exportHomePrintPDF(
      pairs,
      "D",
      "poker",
      undefined,
      "combined",
      opts
    );
    const with_ = await exportHomePrintPDF(
      pairs,
      "D",
      "poker",
      undefined,
      "combined",
      {
        ...opts,
        insertPair: pair("How to Read"),
      }
    );

    expect(await pageCount(without)).toBe(3); // 1 front + flip + 1 back
    expect(await pageCount(with_)).toBe(5); // 2 front + flip + 2 back
  });

  it("scales insert sheets with the copy count, not the document", async () => {
    // 12 copies of the insert overflow one 9-up sheet → 2 insert sheets.
    // A single per-document insert would add only one.
    const blob = await exportHomePrintPDF(
      [pair("ABC")],
      "D",
      "poker",
      undefined,
      "combined",
      {
        copies: 12,
        groupByElement: false,
        insertPair: pair("How to Read"),
      }
    );

    // cards: 1×12 = 12 → 2 sheets. inserts: 12 → 2 sheets. total 4 sheets.
    expect(await pageCount(blob)).toBe(9); // 4 front + flip + 4 back
  });

  it("leaves the document unchanged when no insert is supplied", async () => {
    const blob = await exportHomePrintPDF(
      [pair("ABC")],
      "D",
      "poker",
      undefined,
      "combined",
      {
        copies: 1,
        groupByElement: false,
      }
    );

    expect(await pageCount(blob)).toBe(3);
  });

  it("can emit a two-page file for direct duplex printing", async () => {
    const blob = await exportHomePrintPDF(
      Array.from({ length: 9 }, (_, index) => pair(`C${index + 1}`)),
      "Festival Sampler",
      "poker",
      undefined,
      "combined",
      {
        copies: 1,
        groupByElement: false,
        firstOnTop: false,
        includeFlipInstruction: false,
      }
    );

    expect(await pageCount(blob)).toBe(2);
  });

  it("repeats a duplex handout as complete front/back jobs", async () => {
    const progress: Array<[number, number]> = [];
    const blob = await exportHomePrintPDF(
      Array.from({ length: 9 }, (_, index) => pair(`C${index + 1}`)),
      "Festival Sampler",
      "poker",
      (current, total) => progress.push([current, total]),
      "combined",
      {
        copies: 1,
        jobCopies: 60,
        groupByElement: false,
        firstOnTop: false,
        includeFlipInstruction: false,
      }
    );

    expect(await pageCount(blob)).toBe(120);
    expect(progress).toHaveLength(120);
    expect(progress.at(-1)).toEqual([120, 120]);
  });

  it("alternates matching fronts and backs for a batch of unique sheets", async () => {
    const progress: Array<[number, number]> = [];
    const sheets = Array.from({ length: 3 }, (_, sheetIndex) =>
      Array.from({ length: 9 }, (_, cardIndex) =>
        pair(`P${sheetIndex + 1}C${cardIndex + 1}`)
      )
    );

    const blob = await exportFixedSheetBatchPDF(
      sheets,
      "Festival Sampler",
      "poker",
      (current, total) => progress.push([current, total]),
      "combined",
      { paperSize: "letter" }
    );

    expect(await pageCount(blob)).toBe(6);
    expect(progress).toEqual([
      [1, 6],
      [2, 6],
      [3, 6],
      [4, 6],
      [5, 6],
      [6, 6],
    ]);
  });

  it("emits 13x19 Super B pages holding 25 poker cards when paperSize is superb", async () => {
    // 25 cards fill exactly one 5×5 Super B sheet; on Letter they'd need 3.
    const pairs = Array.from({ length: 25 }, (_, i) => pair(`C${i}`));
    const blob = await exportHomePrintPDF(
      pairs,
      "D",
      "poker",
      undefined,
      "fronts",
      {
        paperSize: "superb",
        copies: 1,
        groupByElement: false,
      }
    );

    const doc = await PDFDocument.load(await blob.arrayBuffer());
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBe(936); // 13" × 72
    expect(height).toBe(1368); // 19" × 72
  });

  it("keeps Letter page dimensions when paperSize is omitted", async () => {
    const blob = await exportHomePrintPDF(
      [pair("ABC")],
      "D",
      "poker",
      undefined,
      "fronts",
      {
        copies: 1,
        groupByElement: false,
      }
    );

    const doc = await PDFDocument.load(await blob.arrayBuffer());
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBe(612);
    expect(height).toBe(792);
  });

  it("embeds print-at-100% viewer preferences", async () => {
    // PrintScaling None defaults honoring viewers (Acrobat, Edge) to Actual
    // size — the guard against the shrink-to-Letter trap that printed tiny
    // cards on a 13x19 sheet.
    const blob = await exportHomePrintPDF(
      [pair("ABC")],
      "D",
      "poker",
      undefined,
      "fronts",
      {
        paperSize: "superb",
        copies: 1,
        groupByElement: false,
      }
    );

    const doc = await PDFDocument.load(await blob.arrayBuffer());
    const prefs = doc.catalog.getOrCreateViewerPreferences();
    expect(prefs.getPrintScaling()).toBe(PrintScaling.None);
    expect(prefs.getPickTrayByPDFSize()).toBe(true);
  });

  it("does not hand the insert to the serialized front renderer", async () => {
    const labels: string[] = [];

    await exportHomePrintPDF([pair("ABC")], "D", "poker", undefined, "fronts", {
      copies: 2,
      groupByElement: false,
      insertPair: pair("How to Read"),
      frontRenderer: async ({ pair: p, cardIndex }) => {
        labels.push(`${p.label}:${cardIndex}`);
        return p.front;
      },
    });

    // Two copies of the one sequence card; the insert never appears.
    expect(labels).toEqual(["ABC:0", "ABC:0"]);
  });
});

describe("exportCalibrationPDF", () => {
  it("emits one page at the exact paper dimensions", async () => {
    const superb = await PDFDocument.load(
      await (await exportCalibrationPDF("poker", "superb")).arrayBuffer()
    );
    expect(superb.getPageCount()).toBe(1);
    expect(superb.getPage(0).getSize()).toEqual({ width: 936, height: 1368 });

    const letter = await PDFDocument.load(
      await (await exportCalibrationPDF("poker", "letter")).arrayBuffer()
    );
    expect(letter.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });

  it("carries the same print-at-100% viewer preferences", async () => {
    const doc = await PDFDocument.load(
      await (await exportCalibrationPDF("poker", "superb")).arrayBuffer()
    );
    const prefs = doc.catalog.getOrCreateViewerPreferences();
    expect(prefs.getPrintScaling()).toBe(PrintScaling.None);
    expect(prefs.getPickTrayByPDFSize()).toBe(true);
  });
});
