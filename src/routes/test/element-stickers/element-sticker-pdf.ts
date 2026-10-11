/**
 * PDF exporter for the six elemental stickers onto die-cut round label paper.
 *
 * Placement is driven by a `LabelTemplate` (fixed label centers), not a
 * centered grid, so the art lands on the physical die-cut circles. Reuses the
 * sticker-lab raster pipeline (`rasterizeSvgToPng` -> `embedPng`) and the
 * 960px @ 300 DPI tile size. The tile is 3.2" (3" art + 0.1" bleed each side);
 * centering it on a 3" label gives a clean bleed past the cut line.
 */

import { PDFDocument, rgb } from "pdf-lib";
import { STICKER_TILE_SIZE_PX, STICKER_DPI } from "#lib/features/sticker-lab/domain/sticker-constants.js";
import { rasterizeSvgToPng } from "#lib/features/sticker-lab/services/rasterize-svg.js";
import { computeLabelCenters, type LabelTemplate } from "./label-template";

const PDF_POINTS_PER_INCH = 72;

export interface ElementStickerJob {
  /** The 960px themed sticker SVG (from renderElementStickerSVG). */
  svg: string;
  /** How many copies of this sticker to place. */
  copies: number;
}

export interface ExportOptions {
  template: LabelTemplate;
  nudgeXIn?: number;
  nudgeYIn?: number;
  /** Draw the dashed cut-circle guides (off for final print on real die-cut paper). */
  showCutLines?: boolean;
}

export async function exportElementStickerPdf(
  jobs: readonly ElementStickerJob[],
  options: ExportOptions
): Promise<Uint8Array> {
  const { template, nudgeXIn = 0, nudgeYIn = 0, showCutLines = false } = options;
  const centers = computeLabelCenters(template, nudgeXIn, nudgeYIn);
  const perPage = centers.length;

  // Flatten jobs into a copy list (jobIndex per slot), preserving order.
  const flat: number[] = [];
  jobs.forEach((job, i) => {
    for (let c = 0; c < job.copies; c++) flat.push(i);
  });
  const pageCount = perPage > 0 ? Math.max(1, Math.ceil(flat.length / perPage)) : 1;

  const doc = await PDFDocument.create();
  const pageWPts = template.sheetWIn * PDF_POINTS_PER_INCH;
  const pageHPts = template.sheetHIn * PDF_POINTS_PER_INCH;
  for (let i = 0; i < pageCount; i++) doc.addPage([pageWPts, pageHPts]);

  // Rasterize each unique sticker once, embed sequentially (pdf-lib page ops
  // are not concurrent-safe).
  const embedded = await Promise.all(
    jobs.map(async (job) => {
      const png = await rasterizeSvgToPng(job.svg, STICKER_TILE_SIZE_PX, STICKER_TILE_SIZE_PX);
      return doc.embedPng(png);
    })
  );

  const tileSizePts = (STICKER_TILE_SIZE_PX / STICKER_DPI) * PDF_POINTS_PER_INCH; // 3.2" = 230.4
  const cutRadiusPts = (template.diameterIn / 2) * PDF_POINTS_PER_INCH;

  flat.forEach((jobIndex, idx) => {
    const page = doc.getPage(Math.floor(idx / perPage));
    const center = centers[idx % perPage]!;
    const cxPts = center.cxIn * PDF_POINTS_PER_INCH;
    // PDF origin is bottom-left; template centers are from the top.
    const cyPts = (template.sheetHIn - center.cyIn) * PDF_POINTS_PER_INCH;

    page.drawImage(embedded[jobIndex]!, {
      x: cxPts - tileSizePts / 2,
      y: cyPts - tileSizePts / 2,
      width: tileSizePts,
      height: tileSizePts,
    });

    if (showCutLines) {
      page.drawCircle({
        x: cxPts,
        y: cyPts,
        size: cutRadiusPts,
        borderColor: rgb(0.6, 0.6, 0.6),
        borderWidth: 0.5,
        borderDashArray: [3, 3],
      });
    }
  });

  return await doc.save();
}
