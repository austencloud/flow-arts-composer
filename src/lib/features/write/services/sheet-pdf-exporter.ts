/**
 * Choreo sheet PDF exporter.
 *
 * Builds a print-ready US-Letter PDF from a sheet and its hydrated sequences.
 * Each step cell is rasterized once at 300 DPI through the existing card render
 * stack (PictographPreparer → Canvas2DDirectRenderer), embedded as a PNG, and
 * positioned by the shared geometry + planner — the same `getSheetPageLayout()`
 * the live preview uses, so the PDF lays out identically. Identical pictographs
 * embed once (keyed by rendered identity).
 *
 * Two layouts share the cell renderer:
 *  - `packing: "flow"` (study sheet): one continuous grid via `planSheet()`.
 *  - `packing: "aligned"` (annotated sheet): row-aligned bands via `planBands()`,
 *    each with an optional left cue rail (timestamp + lyric), a note strip below
 *    the pictograph row, and a page header (title block on page 1, running header
 *    after). The rail/strip/header chrome is vector pdf-lib text; only the
 *    pictograph cells are raster.
 *
 * Step numbers are baked into the raster via the canonical drawStepNumber (the
 * same overlay StepNumber.svelte / the card pipeline use), so print matches the
 * live preview glyph-for-glyph in BOTH layouts. Block separators stay vector.
 */
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import {
  getSheetPageLayout,
  RUNNING_HEADER_PT,
  TITLE_BLOCK_PT,
  type SheetPageGeometry,
} from "../domain/sheet-page-layout";
import {
  planSheet,
  planBands,
  type SheetPage,
  type SheetCell,
} from "./sheet-row-planner";
import { SHEET_CELL_VISIBILITY } from "./sheet-cell-config";
import type { ChoreoSheet } from "../domain/types/choreo-sheet";
import {
  formatSheetRunningTimestamp,
  formatSheetTitleBlock,
} from "../domain/sheet-title-block";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { RenderCanvas } from "$lib/shared/render/services/types";
import { Canvas2DDirectRenderer } from "$lib/shared/render/services/canvas-2d-direct-renderer";
import { drawStepNumber } from "$lib/shared/render/services/step-number-renderer";
import { pictographPreparer } from "$lib/shared/pictograph/shared/services/pictograph-preparer";
import { settingsService as propSettings } from "$lib/shared/settings/state/settings-state.svelte";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { normalizeFanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";

const PRINT_DPI = 300;

// Pixel size of one rasterized cell. A ~1.28" cell at 300 DPI is ~384px — crisp
// for print, cheap to embed.
function cellRasterSizePx(geo: SheetPageGeometry): number {
  return Math.max(1, Math.round((geo.cellSizePt / 72) * PRINT_DPI));
}

// Identity key for raster de-dup: identical letter + blue/red motion + reversals
// + prop types render to identical pixels, so they share one embedded PNG. This
// mirrors what the preparer's own cache keys on. When step numbers are shown they
// are baked into the pixels, so the number joins the identity (`bakedNumber` is
// null when the sheet hides numbers, keeping full de-dup in that mode).
function cellRasterKey(
  step: StepData,
  leftProp: PropType,
  rightProp: PropType,
  bakedNumber: number | null
): string {
  const motions = step.motions ?? {};
  const fingerprint = (m: (typeof motions)["left"]): string =>
    m
      ? [
          m.motionType,
          m.startLocation,
          m.endLocation,
          m.rotationDirection,
          m.turns,
          m.startOrientation,
          m.endOrientation,
        ].join(",")
      : "none";
  return [
    step.letter ?? "none",
    step.gridMode ?? "",
    fingerprint(motions.left),
    fingerprint(motions.right),
    step.leftReversal ? "B" : "",
    step.rightReversal ? "R" : "",
    leftProp,
    rightProp,
    bakedNumber ?? "",
  ].join("|");
}

// RenderCanvas is an OffscreenCanvas in workers/modern browsers, HTMLCanvasElement
// on the fallback path. Both encode to PNG bytes, just via different APIs.
async function canvasToPngBytes(canvas: RenderCanvas): Promise<Uint8Array> {
  if (
    typeof OffscreenCanvas !== "undefined" &&
    canvas instanceof OffscreenCanvas
  ) {
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return new Uint8Array(await blob.arrayBuffer());
  }
  const html = canvas as HTMLCanvasElement;
  const blob: Blob = await new Promise((resolve, reject) =>
    html.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("canvas.toBlob returned null")),
      "image/png"
    )
  );
  return new Uint8Array(await blob.arrayBuffer());
}

// Greedy word-wrap for the cue rail + header — pdf-lib has no text layout.
function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(test, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Notes get exactly one line each — `estimateBandHeight` budgets the strip at
// one line per note, so wrapping a long one would spill into the band below.
// Truncate to the space actually available instead.
export function truncateToWidth(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string {
  if (maxWidth <= 0) return "";
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const ellipsis = "…";
  let cut = text.length;
  while (
    cut > 0 &&
    font.widthOfTextAtSize(text.slice(0, cut) + ellipsis, size) > maxWidth
  )
    cut--;
  return cut > 0 ? text.slice(0, cut) + ellipsis : "";
}

/** Thrown when `shouldCancel` returns true; callers swallow it silently. */
export const CHOREO_SHEET_EXPORT_CANCELLED = "choreo-sheet-export-cancelled";

export async function buildChoreoSheetPDF(
  sheet: ChoreoSheet,
  hydrated: readonly SequenceData[], // normalized rows, in order (see ChoreoSheetView)
  onProgress?: (done: number, total: number) => void,
  breakSequenceIds: Set<string> = new Set(),
  /** Polled once per cell. Returning true aborts before the PDF is finished,
   *  so a cancelled export never produces a downloadable file. */
  shouldCancel?: () => boolean
): Promise<Blob> {
  const geo = getSheetPageLayout(sheet.layout);
  const aligned = sheet.layout.packing === "aligned";

  // Match the live preview's prop types — PictographContainer falls back to the
  // user's settings when no override is given, so the print uses the same.
  const leftProp = propSettings.settings.leftPropType ?? PropType.STAFF;
  const rightProp = propSettings.settings.rightPropType ?? PropType.STAFF;
  const fanAppearance = normalizeFanAppearance(propSettings.settings.fanAppearance);
  const primaryPropColors = propSettings.settings.primaryPropColors
    ? { ...propSettings.settings.primaryPropColors }
    : null;

  const renderer = new Canvas2DDirectRenderer();
  await renderer.initialize();
  const rasterPx = cellRasterSizePx(geo);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontOblique = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Embed-once cache: rendered-identity → PDFImage.
  const imageCache = new Map<string, PDFImage>();

  const separatorColor = rgb(0.4, 0.4, 0.4);
  const cellStroke = rgb(0.8, 0.8, 0.8); // ≈ preview rgba(0,0,0,0.18) on white
  const blankStroke = rgb(0.92, 0.92, 0.92);
  const breakColor = rgb(0.9, 0.24, 0.24);
  const railRule = rgb(0.86, 0.86, 0.86);
  const ink = rgb(0.1, 0.1, 0.1);
  const inkSoft = rgb(0.27, 0.27, 0.27);
  const stride = geo.cellSizePt + geo.gutterPt;

  let total = 0;
  let done = 0;

  // Render one pictograph cell exactly the same in both layouts: outline the box,
  // draw the vector separator/break edge, then embed the raster with its canonical
  // baked step number. `isFirstCell` suppresses the separator on the sheet's very
  // first cell (a boundary reads as an edge BETWEEN runs). `cellBottomY` is the
  // pdf-lib bottom-left y of the cell.
  async function drawCell(
    pdfPage: PDFPage,
    cell: SheetCell,
    cellX: number,
    cellBottomY: number,
    isFirstCell: boolean
  ): Promise<void> {
    // Outline every cell (blanks fainter) so the grid reads as discrete boxes.
    pdfPage.drawRectangle({
      x: cellX,
      y: cellBottomY,
      width: geo.cellSizePt,
      height: geo.cellSizePt,
      borderColor: cell.isBlank ? blankStroke : cellStroke,
      borderWidth: 0.75,
    });

    // Sequences flow continuously, so a boundary is a VERTICAL edge on the
    // sequence-start cell (it can land mid-row), matching the preview.
    if (
      sheet.layout.groupSeparator === "rule" &&
      cell.isSequenceStart &&
      !isFirstCell
    ) {
      pdfPage.drawLine({
        start: { x: cellX, y: cellBottomY },
        end: { x: cellX, y: cellBottomY + geo.cellSizePt },
        thickness: 1,
        color: separatorColor,
      });
    }

    // Break: thick red left edge + label on a sequence start that doesn't
    // connect to the sequence before it. Independent of separator style.
    if (
      cell.isSequenceStart &&
      cell.sequenceId &&
      breakSequenceIds.has(cell.sequenceId)
    ) {
      pdfPage.drawLine({
        start: { x: cellX, y: cellBottomY },
        end: { x: cellX, y: cellBottomY + geo.cellSizePt },
        thickness: 2.5,
        color: breakColor,
      });
      pdfPage.drawText("break", {
        x: cellX + 2,
        y: cellBottomY + 2,
        size: 6,
        font,
        color: breakColor,
      });
    }

    if (cell.isBlank || !cell.step) return;
    const step = cell.step;

    // Step numbers honor the sheet flag; start positions (stepNumber 0) never
    // get one, though the planner only feeds actual steps (>= 1).
    const bakedNumber =
      sheet.layout.showStepNumbers && step.stepNumber && step.stepNumber > 0
        ? step.stepNumber
        : null;

    const key = cellRasterKey(step, leftProp, rightProp, bakedNumber);
    let img = imageCache.get(key);
    if (!img) {
      const prepared = await pictographPreparer.prepareSingle(step, {
        fanAppearance,
        themeMode: "light",
        leftPropType: leftProp,
        rightPropType: rightProp,
      });
      const canvas = await renderer.renderPictograph(prepared, {
        size: rasterPx,
        visibility: {
          ...SHEET_CELL_VISIBILITY,
          fanAppearance,
          primaryPropColors,
          darkMode: false,
          leftPropType: leftProp,
          rightPropType: rightProp,
        },
      });
      if (bakedNumber !== null) {
        // Canonical overlay — same drawStepNumber the preview's StepNumber.svelte
        // mirrors and the card pipeline bakes, anchored 50/950 from the top-left.
        const ctx = canvas.getContext("2d") as
          | CanvasRenderingContext2D
          | OffscreenCanvasRenderingContext2D
          | null;
        if (ctx) drawStepNumber(ctx, bakedNumber, 0, 0, rasterPx, false);
      }
      const bytes = await canvasToPngBytes(canvas);
      img = await pdf.embedPng(bytes);
      imageCache.set(key, img);
    }

    pdfPage.drawImage(img, {
      x: cellX,
      y: cellBottomY,
      width: geo.cellSizePt,
      height: geo.cellSizePt,
    });

    done++;
    onProgress?.(done, total);
    if (shouldCancel?.()) throw new Error(CHOREO_SHEET_EXPORT_CANCELLED);
  }

  if (aligned) {
    const bandPages = planBands({
      sequences: hydrated,
      geo,
      cues: sheet.annotations.cues,
      notes: sheet.annotations.notes,
      showTitleBlock: sheet.annotations.header.showTitleBlock,
    });

    // Count non-blank cells up front so progress is meaningful card-by-card.
    for (const page of bandPages)
      for (const band of page.bands)
        for (const cell of band.cells) if (!cell.isBlank && cell.step) total++;
    onProgress?.(done, total);

    // Rail + strip type scale keyed to cell size, clamped so it stays legible in
    // landscape (large cells) and doesn't crowd portrait (small cells).
    const tsSize = Math.min(11, geo.cellSizePt * 0.12);
    const cueSize = Math.min(10.5, geo.cellSizePt * 0.115);
    const noteSize = Math.min(11, geo.cellSizePt * 0.16);
    const railInnerW = Math.max(0, geo.railWidthPt - geo.gutterPt * 2);
    const railLeftX = geo.marginXPt - geo.railWidthPt; // base margin, left of the grid

    for (const page of bandPages) {
      const pdfPage = pdf.addPage([geo.pageWidthPt, geo.pageHeightPt]);
      let yUsed = 0;

      // ---- Header band (reserves its own height above the first band) ----
      // The advance is the RESERVED height, not whatever the drawing happened to
      // consume — the packer budgeted against these same constants, so the two
      // cannot disagree about where the first band starts.
      if (page.pageIndex === 0 && sheet.annotations.header.showTitleBlock) {
        drawTitleBlock(pdfPage, sheet, geo, {
          fontBold,
          font,
          fontOblique,
          ink,
          inkSoft,
        });
        yUsed += TITLE_BLOCK_PT;
      } else if (page.pageIndex > 0) {
        drawRunningHeader(
          pdfPage,
          sheet,
          page.pageIndex,
          page.bands[0]?.cues[0]?.timestamp ?? "",
          geo,
          {
            font,
            fontOblique,
            ink,
            inkSoft,
            railRule,
          }
        );
        yUsed += RUNNING_HEADER_PT;
      }

      for (let bi = 0; bi < page.bands.length; bi++) {
        const band = page.bands[bi]!;
        if (bi > 0) yUsed += geo.interBandGutterPt;
        const cellTopY = geo.pageHeightPt - geo.marginYPt - yUsed;
        const cellBottomY = cellTopY - geo.cellSizePt;

        // ---- Cue rail ----
        if (sheet.layout.showCueRail) {
          // Faint divider echoing the preview's rail border-right.
          pdfPage.drawLine({
            start: { x: geo.marginXPt - geo.gutterPt, y: cellBottomY },
            end: { x: geo.marginXPt - geo.gutterPt, y: cellTopY },
            thickness: 0.75,
            color: railRule,
          });
          // Every cue anchored in this band, stacked top-down — a band normally
          // holds one, but widening the pictograph size merges two rows into one
          // band and both their cues are real. Matches the preview's rail slots.
          let cueY = cellTopY;
          for (const cue of band.cues) {
            if (cue.timestamp) {
              pdfPage.drawText(cue.timestamp, {
                x: railLeftX,
                y: cueY - tsSize,
                size: tsSize,
                font: fontOblique,
                color: ink,
              });
            }
            let ty = cueY - tsSize - cueSize - 3;
            if (cue.text) {
              const lines = wrapText(
                cue.text,
                fontOblique,
                cueSize,
                railInnerW
              );
              for (const line of lines) {
                pdfPage.drawText(line, {
                  x: railLeftX,
                  y: ty,
                  size: cueSize,
                  font: fontOblique,
                  color: inkSoft,
                });
                ty -= cueSize * 1.2;
              }
            }
            cueY = Math.min(ty, cueY - geo.railLineHeightPt);
          }
        }

        // ---- Pictograph cells ----
        for (let ci = 0; ci < band.cells.length; ci++) {
          const cell = band.cells[ci]!;
          const cellX = geo.marginXPt + ci * stride;
          const isFirstCell = page.pageIndex === 0 && bi === 0 && ci === 0;
          await drawCell(pdfPage, cell, cellX, cellBottomY, isFirstCell);
        }

        // ---- Note strip (below the pictograph row) ----
        if (sheet.layout.showNoteStrips && band.notes.length > 0) {
          let noteY = cellBottomY - 4 - noteSize;
          // Right edge of the last cell — a note may run to the end of the grid
          // but never past it, on paper or on screen.
          const gridRightX =
            geo.marginXPt + geo.columns * stride - geo.gutterPt;
          for (const note of band.notes) {
            // `count` is resolved by the planner from the note's absolute step
            // index — the preview reads the identical value, so a note cannot
            // pin on screen and bullet on paper.
            if (note.count != null) {
              const x = geo.marginXPt + (note.count! - 1) * stride;
              const text = truncateToWidth(
                note.text,
                font,
                noteSize,
                gridRightX - x
              );
              pdfPage.drawText(text, {
                x,
                y: noteY,
                size: noteSize,
                font,
                color: ink,
              });
            } else {
              const bullet = `• ${note.text}`;
              const text = truncateToWidth(
                bullet,
                fontOblique,
                noteSize,
                gridRightX - geo.marginXPt
              );
              pdfPage.drawText(text, {
                x: geo.marginXPt,
                y: noteY,
                size: noteSize,
                font: fontOblique,
                color: ink,
              });
            }
            noteY -= noteSize * 1.35;
          }
        }

        yUsed += band.heightPt;
      }
    }
  } else {
    const pages: SheetPage[] = planSheet(hydrated, sheet.layout);

    // Count non-blank cells up front so progress is meaningful card-by-card.
    for (const page of pages)
      for (const row of page.rows)
        for (const cell of row.cells) if (!cell.isBlank && cell.step) total++;
    onProgress?.(done, total);

    let pageIndex = -1;
    for (const page of pages) {
      pageIndex++;
      const pdfPage = pdf.addPage([geo.pageWidthPt, geo.pageHeightPt]);

      for (let ri = 0; ri < page.rows.length; ri++) {
        const row = page.rows[ri]!;

        for (let ci = 0; ci < row.cells.length; ci++) {
          const cell = row.cells[ci]!;

          // pdf-lib draws from the bottom-left; the page origin is bottom-left too.
          const cellX = geo.marginXPt + ci * stride;
          const cellBottomY =
            geo.pageHeightPt - geo.marginYPt - ri * stride - geo.cellSizePt;
          const isFirstCell = pageIndex === 0 && ri === 0 && ci === 0;

          await drawCell(pdfPage, cell, cellX, cellBottomY, isFirstCell);
        }
      }
    }
  }

  renderer.dispose();
  const bytes = await pdf.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

interface HeaderFonts {
  fontBold: PDFFont;
  font: PDFFont;
  fontOblique: PDFFont;
  ink: ReturnType<typeof rgb>;
  inkSoft: ReturnType<typeof rgb>;
}

// Page-1 title block: centered act name + choreography/song credit + tagline.
// Returns the vertical space it consumed (so the first band starts below it).
function drawTitleBlock(
  pdfPage: PDFPage,
  sheet: ChoreoSheet,
  geo: SheetPageGeometry,
  f: HeaderFonts
): number {
  const header = sheet.annotations.header;
  const titleBlock = formatSheetTitleBlock(sheet.name, header);
  const topY = geo.pageHeightPt - geo.marginYPt;
  const centerX = geo.pageWidthPt / 2;
  const drawCentered = (
    text: string,
    y: number,
    font: PDFFont,
    size: number,
    color: ReturnType<typeof rgb>
  ) => {
    const w = font.widthOfTextAtSize(text, size);
    pdfPage.drawText(text, { x: centerX - w / 2, y, size, font, color });
  };

  // Type scale and line boxes mirror the preview's `.titleblock` rules (act 40pt,
  // by 15pt, made 11pt, tag 13pt at line-height 1.5) so the printed block is the
  // one on screen, and the two together fill TITLE_BLOCK_PT.
  const actSize = 40;
  const bySize = 15;
  const madeSize = 11;
  const tagSize = 13;
  const LINE = 1.5;

  let ty = topY;
  /** Advance one line box and draw the text on its baseline. */
  const line = (
    text: string,
    size: number,
    font: PDFFont,
    color: ReturnType<typeof rgb>,
    gapBefore = 0
  ) => {
    ty -= gapBefore;
    const box = size * LINE;
    ty -= box;
    if (text)
      drawCentered(text, ty + (box - size) / 2 + size * 0.2, font, size, color);
  };

  line(titleBlock.title, actSize, f.fontBold, f.ink);
  line(titleBlock.choreographyLine, bySize, f.font, f.inkSoft, 6);
  line(titleBlock.songLine, bySize, f.font, f.inkSoft, 6);
  line(titleBlock.createdLine, madeSize, f.fontOblique, f.inkSoft, 6);
  line(titleBlock.tagline, tagSize, f.fontBold, f.ink, 10);

  return topY - ty;
}

interface RunHeaderFonts {
  font: PDFFont;
  fontOblique: PDFFont;
  ink: ReturnType<typeof rgb>;
  inkSoft: ReturnType<typeof rgb>;
  railRule: ReturnType<typeof rgb>;
}

// Pages 2+: a slim running header — song name left, page-start timestamp center,
// page number right — with a hairline rule beneath. Returns the space consumed.
function drawRunningHeader(
  pdfPage: PDFPage,
  sheet: ChoreoSheet,
  pageIndex: number,
  startTimestamp: string,
  geo: SheetPageGeometry,
  f: RunHeaderFonts
): number {
  const size = 11;
  const topY = geo.pageHeightPt - geo.marginYPt;
  const baselineY = topY - size;
  const leftX = geo.marginXPt - geo.railWidthPt; // page-left margin, ignoring the rail
  const rightX = geo.pageWidthPt - geo.marginXPt;

  const song = sheet.annotations.header.songName || sheet.name || "";
  if (song) {
    pdfPage.drawText(song, {
      x: leftX,
      y: baselineY,
      size,
      font: f.fontOblique,
      color: f.inkSoft,
    });
  }

  const mid = formatSheetRunningTimestamp(startTimestamp);
  if (mid) {
    const w = f.font.widthOfTextAtSize(mid, size);
    pdfPage.drawText(mid, {
      x: geo.pageWidthPt / 2 - w / 2,
      y: baselineY,
      size,
      font: f.font,
      color: f.inkSoft,
    });
  }

  const pageLabel = String(pageIndex + 1);
  const plw = f.font.widthOfTextAtSize(pageLabel, size);
  pdfPage.drawText(pageLabel, {
    x: rightX - plw,
    y: baselineY,
    size,
    font: f.font,
    color: f.ink,
  });

  const ruleY = baselineY - 5;
  pdfPage.drawLine({
    start: { x: leftX, y: ruleY },
    end: { x: rightX, y: ruleY },
    thickness: 0.75,
    color: f.railRule,
  });

  return topY - ruleY + geo.interBandGutterPt;
}

/** Build the sheet PDF and trigger a browser download. Mirrors downloadCodexSheetPDF. */
export async function downloadChoreoSheetPDF(
  sheet: ChoreoSheet,
  hydrated: readonly SequenceData[],
  filename = "choreo-sheet.pdf",
  onProgress?: (done: number, total: number) => void,
  breakSequenceIds: Set<string> = new Set(),
  shouldCancel?: () => boolean
): Promise<void> {
  const blob = await buildChoreoSheetPDF(
    sheet,
    hydrated,
    onProgress,
    breakSequenceIds,
    shouldCancel
  );
  // Cancel between build and download too, so a stop pressed during `pdf.save()`
  // still leaves nothing on disk.
  if (shouldCancel?.()) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
