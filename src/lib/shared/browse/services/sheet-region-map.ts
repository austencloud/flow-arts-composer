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

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { SequenceExportOptions } from "#lib/shared/render/domain/models/sequence-export-options.js";
import type { ThumbnailRenderInput } from "#lib/shared/browse/services/thumbnail-key-deriver.js";
import {
  cardHeaderWordBounds,
  computeCardFrontLayout,
} from "#lib/shared/render/services/card-front-assembler.js";
import {
  cardMandalaSquare,
  getMandalaPlacements,
  type MandalaVariant,
} from "#lib/shared/sequence-viewer/services/get-mandala-placements.js";

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

/** One mandala the card paints: which hands, and the square it fills. */
export interface SheetMandalaSpot {
  variant: MandalaVariant;
  /** Center of the square, in composed-image pixels. */
  cx: number;
  cy: number;
  /** Side of the square the mandala is fitted into. */
  size: number;
}

/** Where a gallery card paints its mandalas, in composed-image pixels. */
export interface SheetMandalaPlan {
  width: number;
  height: number;
  /** Height of the word strip across the top; 0 when the card has none. */
  headerHeight: number;
  /**
   * Where the strip letters the word, between the level badge and the LOOP
   * icons (cardHeaderWordBounds); a long word is scaled to fit it.
   */
  word: { left: number; right: number };
  /** Empty when the card paints no mandala (too few steps, mandala off). */
  spots: SheetMandalaSpot[];
}

/** The card settings that move or hide its mandalas. Unset = gallery default. */
export interface SheetMandalaSettings {
  startPlacementLayout: "row" | "column";
  showMandala: boolean;
  showQRCode: boolean;
  leftVisible: boolean;
  rightVisible: boolean;
  /** Hand paths drop the inverted LOOP icon, which moves the word's room. */
  handPathMode?: boolean;
  includeStartPlacement?: boolean;
  addWord?: boolean;
  addDifficultyLevel?: boolean;
  addUserInfo?: boolean;
  showNotes?: boolean;
  showLoopGlyph?: boolean;
}

/**
 * Where a gallery card paints its mandalas, so a slow card's drawing can land
 * on the very squares the picture shows them in. Mirrors
 * ImageComposer.renderMandalas: the same placements, the same cell share.
 */
/**
 * The plan's settings for a card's render input, read the way the thumbnail
 * renderer reads them (ThumbnailRenderer.buildRenderOptions), so the plan
 * matches the picture that input paints.
 */
export function sheetMandalaSettings(
  input: ThumbnailRenderInput
): SheetMandalaSettings {
  return {
    startPlacementLayout: input.startPlacementLayout ?? "row",
    showMandala: input.visibility?.showMandala ?? false,
    showQRCode: input.visibility?.showQRCode ?? false,
    leftVisible: input.visibility?.showLeftMotion ?? true,
    rightVisible: input.visibility?.showRightMotion ?? true,
    handPathMode: input.visibility?.handPathMode ?? false,
    includeStartPlacement: input.includeStartPlacement,
    addWord: input.addWord,
    addDifficultyLevel: input.addDifficultyLevel,
    addUserInfo: input.addUserInfo,
    showNotes: input.showNotes,
    showLoopGlyph: input.showLoopGlyph,
  };
}

/**
 * Plans already worked out, per sequence and settings. The word's room asks
 * the LOOP resolver, which serialises the whole sequence for its cache key:
 * about 8 ms a card, 30 ms on a slow phone. A slow card works its plan out
 * while it waits (PropAwareThumbnail.startArrival), so the frame that mounts
 * its drawing finds it here.
 */
const plans = new WeakMap<SequenceData, Map<string, SheetMandalaPlan>>();

export function computeSheetMandalaPlan(
  sequence: SequenceData,
  settings: SheetMandalaSettings
): SheetMandalaPlan {
  const key = JSON.stringify(settings);
  let known = plans.get(sequence);
  if (!known) plans.set(sequence, (known = new Map()));
  let plan = known.get(key);
  if (!plan) known.set(key, (plan = buildSheetMandalaPlan(sequence, settings)));
  return plan;
}

function buildSheetMandalaPlan(
  sequence: SequenceData,
  settings: SheetMandalaSettings
): SheetMandalaPlan {
  const options: Partial<SequenceExportOptions> = {
    ...GALLERY_LAYOUT_OPTIONS,
    startPlacementLayout: settings.startPlacementLayout,
    // The renderer letters the loop from the sequence, not the input.
    loopType: sequence.loopType ?? undefined,
    ...(settings.includeStartPlacement !== undefined && {
      includeStartPlacement: settings.includeStartPlacement,
    }),
    ...(settings.addWord !== undefined && { addWord: settings.addWord }),
    ...(settings.addDifficultyLevel !== undefined && {
      addDifficultyLevel: settings.addDifficultyLevel,
    }),
    ...(settings.addUserInfo !== undefined && {
      addUserInfo: settings.addUserInfo,
    }),
    ...(settings.showNotes !== undefined && { showNotes: settings.showNotes }),
    ...(settings.showLoopGlyph !== undefined && {
      showLoopGlyph: settings.showLoopGlyph,
    }),
  };
  const layout = computeCardFrontLayout(sequence, options, { darkMode: true });
  const plan: SheetMandalaPlan = {
    width: layout.canvasWidth,
    height: layout.canvasHeight,
    headerHeight: layout.headerHeight,
    word: cardHeaderWordBounds(
      sequence,
      options,
      {
        handPathMode: settings.handPathMode,
        showLeftMotion: settings.leftVisible,
        showRightMotion: settings.rightVisible,
      },
      layout
    ),
    spots: [],
  };
  if (!settings.showMandala) return plan;

  const { placements } = getMandalaPlacements({
    stepCount: sequence.steps?.length ?? 0,
    cols: layout.columns,
    rows: layout.rows,
    includeStartPlacement: options.includeStartPlacement ?? false,
    showQRCode: settings.showQRCode,
    leftVisible: settings.leftVisible,
    rightVisible: settings.rightVisible,
    mandalaEnabled: true,
    startPlacementLayout: settings.startPlacementLayout,
  });
  plan.spots = placements.map((p) => {
    const { x, y, size } = cardMandalaSquare(p, layout);
    return { variant: p.variant, cx: x + size / 2, cy: y + size / 2, size };
  });
  return plan;
}
