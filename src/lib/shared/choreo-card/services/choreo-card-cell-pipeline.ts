/**
 * choreo-card-cell-pipeline.ts
 *
 * Pure functions extracted from ChoreoCard.svelte for cell rendering,
 * grid position calculation, duration detection, and preview caching.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { hashSequenceContent } from "$lib/shared/foundation/services/content-hasher";
import type { PreviewCellRenderOptions } from "$lib/shared/sequence-viewer/services/preview-cell-renderer";
import type { TimelineRow } from "$lib/shared/create/utils/grid-calculations";
import type { MandalaLayoutOverride } from "$lib/shared/sequence-viewer/services/get-mandala-placements";
import { getSettings } from "$lib/shared/application/state/app-state.svelte";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { BrowseViewMode } from "$lib/shared/browse/domain/browse-view-mode";

// GLOBAL CELL URL CACHE
// Survives component remounts so drag-to-move doesn't re-render all cells.
// Keyed by sequence content + render options hash. Capped at 30 entries (LRU).

export interface CachedPreview {
  cells: {
    index: number;
    label: string;
    imageUrl: string;
    gridColumn: number;
    gridRow: number;
    duration: number;
  }[];
  columns: number;
  rows: number;
  durationRows?: TimelineRow[];
  hasMixedDurations?: boolean;
  durationColCount?: number;
}

const MAX_PREVIEW_CACHE = 30;
export const globalPreviewCache = new Map<string, CachedPreview>();

/**
 * Derive a stable cache key from the sequence content and render options.
 * Captures all values that affect the rendered output so two sequences with
 * identical letters but different orientations never collide.
 */
export function getPreviewCacheKey(
  seq: SequenceData,
  opts: PreviewCellRenderOptions,
  colCount: number | null,
  isDark: boolean,
  spl: "row" | "column" = "column",
  includeStartPosition: boolean = true
): string {
  const sequenceContentKey = hashSequenceContent(seq);
  const durationFingerprint =
    seq.steps?.map((s) => s.duration ?? 1).join(",") ?? "";
  const vm = opts.browseViewMode;
  const vmKey = vm ? `${vm.subject}-${vm.granularity}-${vm.hand}` : "default";
  // Resolve prop types to actual values (fall back to global settings) so the
  // in-memory cache differentiates between e.g. staff and fan when the caller
  // doesn't explicitly pass a prop type override.
  const settings = getSettings();
  const resolvedLeft = opts.leftPropType ?? settings.leftPropType ?? "staff";
  const resolvedRight = opts.rightPropType ?? settings.rightPropType ?? "staff";
  const mv = `${opts.showLeftMotion === false ? "B0" : "B1"}${opts.showRightMotion === false ? "R0" : "R1"}`;
  const gv = `${opts.showTnD ? "V1" : "V0"}${opts.showElemental ? "E1" : "E0"}${opts.showPositions ? "P1" : "P0"}${opts.showGrid === false ? "G0" : "G1"}`;
  // includeStartPosition changes the cell layout (start cell present + reserved
  // row/col vs. tightly-packed steps) AND the row/column counts. It MUST be in
  // the key: the global preview cache is shared across every ChoreoCard, so a
  // start-off render (viewer with the toggle off) and a start-on render (save
  // panel default) for the same sequence would otherwise collide — the onMount
  // probe adopts the other mode's cells while the frame sizes for this mode,
  // reserving a phantom start row that spreads the step rows apart.
  const sp = includeStartPosition ? "sp1" : "sp0";
  // This cache is checked before the palette-aware cell cache. It must also
  // distinguish colors or a reactive repaint will simply adopt the old images.
  const paletteKey = opts.primaryPropColors
    ? `-colors:${opts.primaryPropColors.left}:${opts.primaryPropColors.right}`
    : "";
  const fanKey = opts.fanAppearance ? `-fan:${JSON.stringify(opts.fanAppearance)}` : "";
  return `${seq.id ?? seq.word ?? "?"}-${sequenceContentKey}-${seq.steps?.length ?? 0}-${opts.size}-${opts.showStepNumbers}-${opts.showNonRadialPoints}-${opts.showTKA}-${opts.showReversals}-${opts.handPathMode ?? false}-${resolvedLeft}-${resolvedRight}-${colCount ?? "auto"}-${isDark ? "dark" : "light"}-spl:${spl}-${sp}-d:${durationFingerprint}-vm:${vmKey}-mv:${mv}-gv:${gv}${paletteKey}${fanKey}`;
}

/**
 * Store a preview in the global cache with LRU eviction.
 * When evicting, revokes blob URLs that are not currently displayed.
 */
export function storePreviewInCache(
  key: string,
  data: CachedPreview,
  activeCells: { imageUrl: string; fadeOutUrl?: string }[]
): void {
  if (
    globalPreviewCache.size >= MAX_PREVIEW_CACHE &&
    !globalPreviewCache.has(key)
  ) {
    const oldest = globalPreviewCache.keys().next().value;
    if (oldest !== undefined) {
      const evicted = globalPreviewCache.get(oldest);
      if (evicted) {
        const activeUrls = new Set<string>();
        for (const c of activeCells) {
          if (c.imageUrl.startsWith("blob:")) activeUrls.add(c.imageUrl);
          if (c.fadeOutUrl?.startsWith("blob:")) activeUrls.add(c.fadeOutUrl);
        }
        for (const cell of evicted.cells) {
          if (
            cell.imageUrl.startsWith("blob:") &&
            !activeUrls.has(cell.imageUrl)
          ) {
            URL.revokeObjectURL(cell.imageUrl);
          }
        }
      }
      globalPreviewCache.delete(oldest);
    }
  }
  globalPreviewCache.set(key, data);
}

/**
 * Calculate grid position for a step index.
 * With start position (column layout): first column reserved for start.
 * With start position (row layout): first row reserved for start.
 * Without start position: all columns available for steps.
 */
export function calculateGridPosition(
  stepIndex: number,
  cols: number,
  includeStartPosition: boolean,
  startPositionLayout: "row" | "column",
  mandalaLayoutOverride: MandalaLayoutOverride | null
): { gridColumn: number; gridRow: number } {
  // 4-count horizontal mandala override: start/step positions come from the override spec.
  if (mandalaLayoutOverride) {
    if (stepIndex === -1) {
      return {
        gridColumn: mandalaLayoutOverride.startPos.col,
        gridRow: mandalaLayoutOverride.startPos.row,
      };
    }
    const pos = mandalaLayoutOverride.stepPositions[stepIndex];
    if (pos) return { gridColumn: pos.col, gridRow: pos.row };
  }

  // Start position is always at column 1, row 1
  if (stepIndex === -1) {
    return { gridColumn: 1, gridRow: 1 };
  }

  if (includeStartPosition && startPositionLayout === "row") {
    // Row layout: start position occupies row 1 alone; steps fill full-width
    // rows starting at row 2, using all `cols` columns.
    const col = (stepIndex % cols) + 1;
    const row = Math.floor(stepIndex / cols) + 2;
    return { gridColumn: col, gridRow: row };
  }

  if (includeStartPosition) {
    // Column layout: col 1 is reserved for start, steps start at col 2.
    const stepsPerRow = cols - 1;
    const firstRowSteps = cols - 1;

    if (stepIndex < firstRowSteps) {
      return { gridColumn: stepIndex + 2, gridRow: 1 };
    }

    const remainingIndex = stepIndex - firstRowSteps;
    const row = Math.floor(remainingIndex / stepsPerRow) + 2;
    const col = (remainingIndex % stepsPerRow) + 2;
    return { gridColumn: col, gridRow: row };
  } else {
    // Without start position: all columns available for steps
    const col = (stepIndex % cols) + 1;
    const row = Math.floor(stepIndex / cols) + 1;
    return { gridColumn: col, gridRow: row };
  }
}

/**
 * Detect whether the sequence has mixed (non-uniform) durations.
 * Returns false if all durations are 1.0 or undefined.
 * Implementation lives in the leaf module `step-durations.ts` so the
 * canonical cell warm can share it without this file's heavy imports;
 * re-exported here for the existing UI callers.
 */
export { detectMixedDurations } from "./step-durations";

/**
 * Build render options from component visibility/prop state.
 * Pure function — takes all required state as parameters.
 */
export function buildRenderOptions(params: {
  cellSize: number;
  leftPropType: PropType | undefined;
  rightPropType: PropType | undefined;
  catDogModeEnabled: boolean;
  leftBuugengFlipped: boolean;
  rightBuugengFlipped: boolean;
  showNonRadial: boolean;
  showGrid: boolean;
  handPointVis: "all" | "active" | "none";
  showTKA: boolean;
  showReversals: boolean;
  showTnD: boolean;
  showElemental: boolean;
  showPositions: boolean;
  isSoloMode: boolean;
  handPathMode: boolean;
  browseViewMode: BrowseViewMode | undefined;
  showLeftMotion: boolean;
  showRightMotion: boolean;
}): PreviewCellRenderOptions {
  return {
    size: params.cellSize,
    leftPropType: params.leftPropType,
    rightPropType: params.rightPropType,
    catDogModeEnabled: params.catDogModeEnabled,
    leftBuugengFlipped: params.leftBuugengFlipped,
    rightBuugengFlipped: params.rightBuugengFlipped,
    // Never bake step numbers into the rendered blob - identical pictographs
    // at different beats must share the same cached image. Step numbers are
    // rendered as HTML overlays on top of the <img> instead.
    showStepNumbers: false,
    showNonRadialPoints: params.showNonRadial,
    showGrid: params.showGrid,
    handPointVisibility: params.handPointVis,
    showTKA: params.isSoloMode ? false : params.showTKA,
    showReversals: params.isSoloMode ? false : params.showReversals,
    showTnD: params.isSoloMode ? false : params.showTnD,
    showElemental: params.isSoloMode ? false : params.showElemental,
    showPositions: params.isSoloMode ? false : params.showPositions,
    handPathMode: params.handPathMode,
    browseViewMode: params.browseViewMode,
    showLeftMotion: params.showLeftMotion,
    showRightMotion: params.showRightMotion,
  };
}
