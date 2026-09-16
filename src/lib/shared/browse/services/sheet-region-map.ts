/**
 * Sheet region map — where each piece of a gallery card's baked thumbnail
 * lives, as fractions of the image.
 *
 * The play-preview morph needs to pair regions of the static raster (the word
 * header, the pictograph grid, the start cell, the first few step cells) with
 * their live counterparts in the animated preview. The raster is one cached
 * <img>, so the pairing works by sprite-cropping it — and that only works if
 * the crop rects are exactly where the composer painted. This module reuses
 * the composer's own layout math (computeCardFrontLayout, extracted verbatim
 * from ImageComposer) rather than re-deriving it, so the rects are right by
 * construction for any step count and start-placement layout.
 *
 * Everything here is pure geometry: no DOM, no canvas, unit-testable.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
import { computeCardFrontLayout } from "$lib/shared/render/services/card-front-assembler";

/** A rectangle in image space, all values fractions of the full image (0..1). */
export interface SheetRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SheetRegionMap {
  /** Word / difficulty / LOOP-glyph strip across the top. Null when the sheet
   * has no header (no word, no badges). */
  header: SheetRegion | null;
  /** The full pictograph grid — the region the mandala is drawn over, and the
   * one that grows into the animator stage. */
  grid: SheetRegion;
  /** Start-position cell, when the sheet includes one. */
  start: SheetRegion | null;
  /** Step cells in order (index 0 = step 1). Full list; consumers take what
   * they need. */
  steps: SheetRegion[];
  /** Width / height of the composed image — for sanity-checking against the
   * loaded <img>'s natural size before trusting the crops. */
  canvasAspect: number;
}

/**
 * Gallery composition defaults, mirrored from thumbnail-renderer.ts
 * (GALLERY_DEFAULTS + DEFAULT_BEAT_SIZE). Geometry only cares about the
 * layout-affecting subset. Kept in lockstep with the renderer — a drift here
 * shows up as crops that don't line up with the baked pixels.
 */
const GALLERY_LAYOUT_OPTIONS: Partial<SequenceExportOptions> = {
  stepSize: 240,
  addWord: true,
  addStepNumbers: true,
  includeStartPlacement: true,
  addDifficultyLevel: true,
  addUserInfo: false,
  showNotes: true,
};

/**
 * Compute the region map for a gallery-variant thumbnail of `sequence`.
 *
 * `startPlacementLayout` is the card's EFFECTIVE layout (the per-step-count
 * "Top Row" / "Left Column" resolution PropAwareThumbnail already performs) —
 * pass that resolved value, not the raw user setting.
 */
export function computeSheetRegionMap(
  sequence: SequenceData,
  startPlacementLayout: "row" | "column"
): SheetRegionMap {
  const options: Partial<SequenceExportOptions> = {
    ...GALLERY_LAYOUT_OPTIONS,
    startPlacementLayout,
    loopType: sequence.loopType ?? undefined,
  };

  // darkMode is the only visibility field the layout reads, and it does not
  // affect geometry — pass the gallery's dark default for faithfulness.
  const layout = computeCardFrontLayout(sequence, options, { darkMode: true });

  const {
    canvasWidth,
    canvasHeight,
    headerHeight,
    stepSize,
    columns,
    rows,
    gridOffsetX,
    gridOffsetY,
    startColumn,
    startRow,
    stepsPerRow,
    hasStartPlacement,
  } = layout;

  const frac = (px: number, total: number) => px / total;

  const cellRegion = (col: number, row: number): SheetRegion => ({
    x: frac(gridOffsetX + col * stepSize, canvasWidth),
    y: frac(gridOffsetY + row * stepSize, canvasHeight),
    w: frac(stepSize, canvasWidth),
    h: frac(stepSize, canvasHeight),
  });

  const steps: SheetRegion[] = [];
  const stepCount = sequence.steps?.length ?? 0;
  for (let i = 0; i < stepCount; i++) {
    steps.push(
      cellRegion(startColumn + (i % stepsPerRow), startRow + Math.floor(i / stepsPerRow))
    );
  }

  return {
    header:
      headerHeight > 0
        ? { x: 0, y: 0, w: 1, h: frac(headerHeight, canvasHeight) }
        : null,
    grid: {
      x: frac(gridOffsetX, canvasWidth),
      y: frac(gridOffsetY, canvasHeight),
      w: frac(columns * stepSize, canvasWidth),
      h: frac(rows * stepSize, canvasHeight),
    },
    // The composer draws the start position at grid cell (0, 0) in both
    // layout modes; startRow/startColumn shift the STEPS away from it.
    start: hasStartPlacement ? cellRegion(0, 0) : null,
    steps,
    canvasAspect: canvasWidth / canvasHeight,
  };
}
