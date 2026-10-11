import { describe, it, expect, vi, beforeEach } from "vitest";
import { PDFDocument } from "pdf-lib";
import { StickerSheetPdfExporter } from "#lib/features/sticker-lab/services/sticker-sheet-pdf-exporter.js";
import {
  createDefaultStickerSheet,
  createDefaultStickerUnit,
  type MandalaPrimitiveRef,
} from "#lib/features/sticker-lab/domain/sticker-types.js";
import type { StickerMandalaLookup } from "#lib/features/sticker-lab/services/types.js";

// Mock the rasterizer to return a tiny valid PNG (1x1 transparent RGBA).
// Generated via Node zlib.deflateSync to produce a PNG that pdf-lib's UPNG decoder accepts.
const ONE_PX_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0b, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x60, 0x00, 0x02, 0x00, 0x00, 0x05, 0x00, 0x01,
  0x7a, 0x5e, 0xab, 0x3f, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

vi.mock("#lib/features/sticker-lab/services/rasterize-svg.js", () => ({
  rasterizeSvgToPng: vi.fn(async () => ONE_PX_PNG),
}));

const testRef: MandalaPrimitiveRef = {
  shapeHash: "shape-1",
  ultraHash: "shape-1",
  identityKind: "geometry-v1",
  representativeSequenceId: "sequence-1",
  displayName: "Alpha",
};

const emptyLookup: StickerMandalaLookup = {
  getPaths: () => ({ left: [], right: [], purple: [] }),
};

describe("StickerSheetPdfExporter", () => {
  let exporter: StickerSheetPdfExporter;

  beforeEach(() => {
    exporter = new StickerSheetPdfExporter();
  });

  it("exports an empty sheet as a valid single-page PDF at 8.5x11", async () => {
    const sheet = createDefaultStickerSheet();
    const bytes = await exporter.export(sheet, emptyLookup);

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const page = doc.getPage(0);
    // 8.5 inches = 612 points (72 dpi in PDF coordinate space)
    expect(page.getWidth()).toBeCloseTo(612, 0);
    expect(page.getHeight()).toBeCloseTo(792, 0);
  });

  it("13x19 sheet size produces correct PDF page dimensions", async () => {
    const sheet = {
      ...createDefaultStickerSheet(),
      sheetSize: "13x19" as const,
    };
    const bytes = await exporter.export(sheet, emptyLookup);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPage(0).getWidth()).toBeCloseTo(936, 0); // 13 * 72
    expect(doc.getPage(0).getHeight()).toBeCloseTo(1368, 0); // 19 * 72
  });

  it("stickers overflowing one page produce multiple pages", async () => {
    // 8.5x11 fits 6 stickers per page. 7 copies of one sticker should paginate.
    const unit = createDefaultStickerUnit({ primitiveRef: testRef, copies: 7 });
    const sheet = {
      ...createDefaultStickerSheet(),
      stickers: [unit],
    };
    const bytes = await exporter.export(sheet, emptyLookup);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
  });

  it("skips stickers whose mandala paths are missing from the lookup", async () => {
    const unit = createDefaultStickerUnit({
      primitiveRef: {
        shapeHash: "missing-id",
        ultraHash: "missing-id",
        identityKind: "geometry-v1",
        representativeSequenceId: "missing-sequence",
      },
    });
    const sheet = { ...createDefaultStickerSheet(), stickers: [unit] };
    const lookup: StickerMandalaLookup = { getPaths: () => null };
    const bytes = await exporter.export(sheet, lookup);
    const doc = await PDFDocument.load(bytes);
    // Still produces a page (empty), does not throw.
    expect(doc.getPageCount()).toBe(1);
  });

  it("lookup receives the primitiveRef.shapeHash, not any legacy sequenceId", async () => {
    const unit = createDefaultStickerUnit({ primitiveRef: testRef });
    const sheet = { ...createDefaultStickerSheet(), stickers: [unit] };
    const getPathsSpy = vi.fn(() => ({ left: [], right: [], purple: [] }));
    await exporter.export(sheet, { getPaths: getPathsSpy });
    expect(getPathsSpy).toHaveBeenCalledWith("shape-1");
  });
});
