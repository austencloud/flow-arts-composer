import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { hashSequenceContent } from "$lib/shared/foundation/services/content-hasher";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

export interface ChoreoCardRenderKeyInputs {
  primaryPropColors?: { left: string; right: string } | null;
  sequence: SequenceData | null | undefined;
  handPathMode?: boolean;
  browseViewMode?: import("$lib/shared/browse/domain/browse-view-mode").BrowseViewMode;
  leftPropType: PropType | undefined;
  rightPropType: PropType | undefined;
  catDogModeEnabled: boolean;
  leftBuugengFlipped: boolean;
  rightBuugengFlipped: boolean;
  showStepNumbers: boolean;
  showNonRadial: boolean;
  handPointVis: "all" | "active" | "none";
  showTKA: boolean;
  showReversals: boolean;
  showTnD: boolean;
  showElemental: boolean;
  showPositions: boolean;
  showGrid: boolean;
  showLeftMotion: boolean;
  showRightMotion: boolean;
  includeStartPosition: boolean;
  startPositionLayout: "row" | "column";
  effectiveColumns: number;
  darkMode: boolean;
}

export interface ChoreoCardRenderKeys {
  imageKey: string;
  contentKey: string;
  gridStableKey: string;
  /**
   * The subset of imageKey that changes the pictograph's ARROW/PROP GEOMETRY —
   * sequence identity, letters, prop types, cat-dog, durations, motion
   * visibility. When THIS changes, old and new pictographs are structurally
   * different, so an overlapping crossfade would ghost/double-expose them
   * (the `swap` transition exists for exactly this case).
   *
   * When imageKey changes but structuralKey does NOT, only an OVERLAY toggled —
   * non-radial points, grid, hand points, TKA/VTG/elemental/positions glyphs,
   * step numbers. The base pictograph is identical, so a crossfade dissolves the
   * overlay in/out with zero ghosting. Routing those through `swap` was the
   * "whole grid flashes out and in" bug (swap blanks every cell mid-transition).
   */
  structuralKey: string;
  renderKey: string;
}

/**
 * Single source of truth for ChoreoCard's render-trigger keys.
 *
 * ChoreoCard's onMount (to seed change-detection) and its render $effect (to
 * detect changes) both need these keys. They used to build them with duplicated
 * inline template strings; the copies drifted — `showGrid` was added to the
 * $effect's image-key `gv` segment but not to onMount's. So on the first
 * post-mount $effect run the keys never matched: classifyChange saw an "image
 * changed" with a stable grid and fired a spurious "grid-stable-image"
 * crossfade, blipping the whole grid out and back in once after the initial
 * paint. One builder used by both call sites makes that drift impossible.
 *
 * - imageKey: every prop that changes the rendered pictograph IMAGE.
 * - gridStableKey: only props that change grid STRUCTURE (count, columns,
 *   durations, start row). A crossfade-swap is only safe when this is unchanged.
 * - contentKey: imageKey + layout (columns, start toggle).
 * - renderKey: contentKey + darkMode (dark mode isn't folded into content/image).
 */
export function buildChoreoCardRenderKeys(
  i: ChoreoCardRenderKeyInputs
): ChoreoCardRenderKeys {
  const sequenceContentKey = i.sequence ? hashSequenceContent(i.sequence) : "";
  const stepCount = i.sequence?.steps?.length ?? 0;
  const durationKey =
    i.sequence?.steps?.map((s) => s.duration ?? 1).join(",") ?? "";

  // Chirality mirrors the prop and can collapse the beta separation offset, so
  // it changes prop GEOMETRY — it belongs in the structural key, not the
  // overlay-only bucket.
  const ch = `${i.leftBuugengFlipped ? "1" : "0"}${i.rightBuugengFlipped ? "1" : "0"}`;
  const gv = `${i.showTnD ? "1" : "0"}${i.showElemental ? "1" : "0"}${i.showPositions ? "1" : "0"}${i.showGrid ? "1" : "0"}`;
  const paletteKey = i.primaryPropColors
    ? `-colors:${i.primaryPropColors.left}:${i.primaryPropColors.right}`
    : "";
  const viewKey = `-view:${i.handPathMode ?? false}:${i.browseViewMode?.subject ?? "props"}:${i.browseViewMode?.granularity ?? "combined"}:${i.browseViewMode?.hand ?? "left"}`;
  const imageKey = `${i.sequence?.id ?? ""}-${sequenceContentKey}-${stepCount}-${i.leftPropType}-${i.rightPropType}-${i.catDogModeEnabled}-${i.showStepNumbers}-${i.showNonRadial}-${i.handPointVis}-${i.showTKA}-${i.showReversals}-${durationKey}-mv:${i.showLeftMotion ? "1" : "0"}${i.showRightMotion ? "1" : "0"}-ch:${ch}-gv:${gv}${paletteKey}${viewKey}`;
  // startPositionLayout (row vs column) changes where the start cell sits and
  // therefore where every step cell AND the QR cell land. It's in the CONTENT
  // (layout) key but NOT imageKey/gridStableKey/structuralKey: a pure row↔column
  // flip (autoFit re-picking placement as the container aspect changes) must
  // re-run the render effect and route to "layout-only" → relayoutCells(), or the
  // cells keep stale positions while the live qrGridPosition moves — the QR then
  // overlaps an occupied step cell (the side-by-side "QR flashes over step 1" bug).
  const layoutKey = `${i.includeStartPosition}-cols:${i.effectiveColumns}-spl:${i.startPositionLayout}`;
  const contentKey = `${imageKey}-${layoutKey}`;
  const gridStableKey = `${stepCount}-${durationKey}-cols:${i.effectiveColumns}-isp:${i.includeStartPosition}`;
  // Geometry-only subset (see interface docs). Deliberately excludes every
  // overlay-visibility flag so a non-radial / glyph / grid / points toggle
  // leaves it unchanged → crossfade, not swap.
  const structuralKey = `${i.sequence?.id ?? ""}-${sequenceContentKey}-${stepCount}-${i.leftPropType}-${i.rightPropType}-${i.catDogModeEnabled}-${durationKey}-mv:${i.showLeftMotion ? "1" : "0"}${i.showRightMotion ? "1" : "0"}-ch:${ch}${viewKey}`;
  const renderKey = `${contentKey}-${i.darkMode}`;

  return { imageKey, contentKey, gridStableKey, structuralKey, renderKey };
}
