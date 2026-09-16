/**
 * choreo-card-layout-state.svelte.ts
 *
 * Reactive layout derivations extracted from ChoreoCard.svelte.
 * Computes column/row counts, aspect ratio, header/footer sizing,
 * and font scales from sequence data and composition settings.
 */

import { calculateLayout } from "$lib/shared/render/services/layout-calculator";
import {
  pickBestFitLayout,
  pickScrollColumns,
  type FitLayout,
  type ResolvedAutoLayout,
} from "$lib/shared/render/services/container-aware-layout";
import { getMandalaPlacements } from "$lib/shared/sequence-viewer/services/get-mandala-placements";
import { simplifyAndTruncate } from "$lib/shared/foundation/utils/word-simplifier";
import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";
import {
  HEADER_HEIGHT_DIVISOR,
  FOOTER_HEIGHT_DIVISOR,
  BADGE_SIZE_SCALE,
  BADGE_PADDING_SCALE,
  BADGE_NUMBER_FONT_SCALE,
  HEADER_WORD_FONT_SCALE,
  HEADER_WORD_FONT_MIN_SCALE,
  FOOTER_FONT_SCALE,
  FOOTER_MARGIN_SCALE,
  STEP_NUMBER_FONT_RATIO,
  STEP_NUMBER_FONT_MAX,
} from "@tka/render-composition";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

export interface ChoreoCardLayoutDeps {
  /** The sequence being displayed */
  readonly sequence: SequenceData;
  /** Whether to include the start position cell */
  readonly includeStartPlacement: boolean;
  /** Override auto-calculated column count (null = auto) */
  readonly columnCount: number | null;
  /** Whether header is visible */
  readonly showHeader: boolean;
  /** Whether footer is visible */
  readonly showFooter: boolean;
  /** Whether QR code is visible */
  readonly showQRCode: boolean;
  /** Whether Auto must reserve an info cell for the requested QR setting */
  readonly autoLayoutReservesQRCode: boolean;
  /** Whether mandalas are enabled */
  readonly showMandala: boolean;
  /** Force contain mode */
  readonly forceContain: boolean;
  /** Blue motion visibility */
  readonly showLeftMotion: boolean;
  /** Red motion visibility */
  readonly showRightMotion: boolean;
  /** Per-instance override for start-placement layout */
  readonly startPlacementLayoutOverride: "row" | "column" | null;
  /** Reactive composition version counter (bumped by observer) */
  readonly compositionVersion: number;
  /** Cell width from ResizeObserver */
  readonly cellWidth: number;
  /** Whether mixed durations are present */
  readonly hasMixedDurations: boolean;
  /** Max duration units in any single row */
  readonly durationColCount: number;
  /** Raw container width (px) for container-aware Auto layout. 0 = not measured. */
  readonly containerWidth: number;
  /** Raw container height (px) for container-aware Auto layout. 0 = not measured. */
  readonly containerHeight: number;
  /**
   * The last readable Auto shape, held while a parent workspace recomposes.
   * Auto remains container-aware at rest; this only prevents a transient
   * container from changing the identity of the Card mid-transition.
   */
  readonly autoLayoutOverride: ResolvedAutoLayout | null;
}

export function createChoreoCardLayoutState(
  getDeps: () => ChoreoCardLayoutDeps
) {
  const compositionManager = getImageCompositionManager();

  const SCROLL_THRESHOLD = 16;
  // Legibility floor for the on-screen header (badge + word). Export/print
  // (forceContain) stays purely proportional so the preview matches the
  // compositor. Anything that renders the header MUST size the contain box
  // through containModel below so this floor is part of the same geometry.
  const HEADER_MIN_PX = 24;

  // Whether the sequence exceeds scroll threshold (independent of forceContain)
  const isLongSequence = $derived(
    (getDeps().sequence?.steps?.length ?? 0) > SCROLL_THRESHOLD
  );
  const needsScroll = $derived(!getDeps().forceContain && isLongSequence);

  const usesAutomaticColumns = $derived.by(() => {
    const deps = getDeps();
    void deps.compositionVersion;
    const stepCount = deps.sequence?.steps?.length ?? 0;
    if (stepCount < 1) return false;
    if (deps.startPlacementLayoutOverride) return false;
    if (deps.columnCount !== null && deps.columnCount > 0) return false;
    return compositionManager.getColumnCountForStepCount(stepCount) === null;
  });

  // Container-aware "Auto" layout. Download Card is force-contained, so it
  // evaluates every column count and both start placements against the actual
  // preview frame. Scrolling cards keep their width-driven path; contained long
  // cards are eligible because they must choose one complete grid.
  const autoFit = $derived.by<FitLayout | null>(() => {
    const deps = getDeps();
    void deps.compositionVersion;
    const stepCount = deps.sequence?.steps?.length ?? 0;
    if (!usesAutomaticColumns) return null;
    if (isLongSequence && !deps.forceContain) return null; // scroll path handled below
    if (deps.autoLayoutOverride?.stepCount === stepCount) {
      return deps.autoLayoutOverride;
    }
    const cw = deps.containerWidth;
    const ch = deps.containerHeight;
    if (!(cw > 0) || !(ch > 0)) return null; // not measured yet → table fallback
    return pickBestFitLayout({
      stepCount,
      stepDurations: deps.sequence.steps.map((step) => step.duration ?? 1),
      includeStartPlacement: deps.includeStartPlacement,
      containerWidth: cw,
      containerHeight: ch,
      showHeader: deps.showHeader,
      showFooter: deps.showFooter,
      showQRCode: deps.autoLayoutReservesQRCode,
    });
  });

  // Start-position layout - "row" puts start in a top row spanning all columns,
  // "column" puts start in a left column. On Auto the best-fit picker chooses
  // placement for the container; otherwise the composition setting applies.
  const startPlacementLayout = $derived.by<"row" | "column">(() => {
    const deps = getDeps();
    if (deps.startPlacementLayoutOverride)
      return deps.startPlacementLayoutOverride;
    const af = autoFit;
    if (af && deps.includeStartPlacement && af.startPlacement !== "none") {
      return af.startPlacement;
    }
    void deps.compositionVersion;
    const stepCount = deps.sequence?.steps?.length ?? 0;
    if (stepCount === 0) return compositionManager.startPlacementLayout;
    return compositionManager.getStartPlacementLayoutForStepCount(stepCount);
  });

  // Effective columns - synchronously computed from best-fit or the layout tables
  const baseColumns = $derived.by(() => {
    const af = autoFit;
    if (af) return af.cols;
    const deps = getDeps();
    void deps.compositionVersion;
    const seq = deps.sequence;
    if (!seq?.steps?.length) return 0;
    const stepCount = seq.steps.length;
    const spl = startPlacementLayout;

    if (deps.columnCount !== null && deps.columnCount > 0) {
      return deps.includeStartPlacement && spl === "column"
        ? deps.columnCount + 1
        : deps.columnCount;
    }
    // Check the per-length column count from global composition settings.
    const compositionCols =
      compositionManager.getColumnCountForStepCount(stepCount);
    if (compositionCols !== null && compositionCols > 0) {
      return deps.includeStartPlacement && spl === "column"
        ? compositionCols + 1
        : compositionCols;
    }
    // Long scrolling sequences adapt to width. A contained card only reaches
    // this five-column fallback before its container has been measured; Auto
    // replaces it with the exhaustive winner immediately afterward.
    if (isLongSequence) {
      if (needsScroll && deps.containerWidth > 0)
        return pickScrollColumns(deps.containerWidth);
      return 5;
    }
    const [cols] = calculateLayout(stepCount, deps.includeStartPlacement, spl);
    return cols;
  });

  // Effective rows
  const baseRows = $derived.by(() => {
    const af = autoFit;
    if (af) return af.rows;
    const deps = getDeps();
    void deps.compositionVersion;
    const seq = deps.sequence;
    if (!seq?.steps?.length) return 0;
    const stepCount = seq.steps.length;
    const cols = baseColumns;
    const spl = startPlacementLayout;
    const hasCompositionOverride =
      compositionManager.getColumnCountForStepCount(stepCount) !== null;

    if (
      cols > 0 &&
      (deps.columnCount !== null || isLongSequence || hasCompositionOverride)
    ) {
      if (deps.includeStartPlacement && spl === "row") {
        return 1 + Math.ceil(stepCount / cols);
      }
      const stepsPerRow = deps.includeStartPlacement ? cols - 1 : cols;
      const firstRowSteps = Math.min(stepsPerRow, stepCount);
      const remainingSteps = stepCount - firstRowSteps;
      return 1 + Math.ceil(remainingSteps / stepsPerRow);
    }

    const [, rws] = calculateLayout(stepCount, deps.includeStartPlacement, spl);

    // Column layout only: mandala fill needs at least one col-1 empty between
    if (
      deps.showMandala &&
      deps.showQRCode &&
      deps.includeStartPlacement &&
      spl === "column" &&
      stepCount === 6 &&
      rws === 2
    ) {
      return 3;
    }
    return rws;
  });

  // Compute mandala placements + optional 4-count horizontal layout override.
  const mandalaResult = $derived.by(() => {
    const deps = getDeps();
    return getMandalaPlacements({
      stepCount: deps.sequence?.steps?.length ?? 0,
      cols: baseColumns,
      rows: baseRows,
      includeStartPlacement: deps.includeStartPlacement,
      showQRCode: deps.showQRCode,
      leftVisible: deps.showLeftMotion,
      rightVisible: deps.showRightMotion,
      mandalaEnabled: deps.showMandala,
      startPlacementLayout,
    });
  });
  const mandalaLayoutOverride = $derived(mandalaResult.layoutOverride);
  const mandalaPlacements = $derived(mandalaResult.placements);

  // Final effective dims
  const effectiveColumns = $derived(mandalaLayoutOverride?.cols ?? baseColumns);
  const effectiveRows = $derived(mandalaLayoutOverride?.rows ?? baseRows);

  // The single geometry model behind the contain fit: everything the card's
  // height is made of, in cell-width units, plus the header's px floor (which
  // a pure width/height ratio cannot express). ChoreoCard's contain math and
  // the rendered header/footer heights both derive from these SAME pieces —
  // keeping them in one place is what prevents the modeled box and the actual
  // content from disagreeing (the disagreement is what clips grid rows).
  const containModel = $derived.by(() => {
    const deps = getDeps();
    const cols =
      autoFit?.widthUnits ??
      (deps.hasMixedDurations && deps.durationColCount > 0
        ? deps.durationColCount
        : effectiveColumns) ??
      1;
    const hfScale = cols >= 3 ? 1 : cols / 3;
    return {
      cols,
      gridHeightUnits: effectiveRows,
      headerUnits: deps.showHeader ? (1 / HEADER_HEIGHT_DIVISOR) * hfScale : 0,
      footerUnits: deps.showFooter ? (1 / FOOTER_HEIGHT_DIVISOR) * hfScale : 0,
      // scaledHeaderHeight never renders below this (0 = floor not in play:
      // header hidden, or the proportional export path).
      headerMinPx: deps.showHeader && !deps.forceContain ? HEADER_MIN_PX : 0,
    };
  });

  // Compute aspect ratio for the entire preview (width / height).
  // Pure proportional form — valid while the header floor isn't engaged;
  // updateContainedDimensions handles the floored regime via containModel.
  const previewAspectRatio = $derived.by(() => {
    if (!effectiveColumns || !effectiveRows) return 1;
    const m = containModel;
    return m.cols / (m.gridHeightUnits + m.headerUnits + m.footerUnits);
  });

  // Scaled sizes based on grid element width.
  const headerFooterRefWidth = $derived.by(() => {
    const cw = getDeps().cellWidth;
    if (!cw || !Number.isFinite(cw)) return 0;
    const cols = containModel.cols;
    if (cols >= 3) return cw;
    return (cw * cols) / 3;
  });

  const scaledHeaderHeight = $derived.by(() => {
    if (!headerFooterRefWidth) return 0;
    const proportional = Math.floor(
      headerFooterRefWidth / HEADER_HEIGHT_DIVISOR
    );
    return getDeps().forceContain
      ? proportional
      : Math.max(proportional, HEADER_MIN_PX);
  });

  const scaledFooterHeight = $derived.by(() => {
    if (!headerFooterRefWidth) return 0;
    return Math.floor(headerFooterRefWidth / FOOTER_HEIGHT_DIVISOR);
  });

  const stepNumFontSize = $derived(
    getDeps().cellWidth
      ? Math.min(
          Math.round(getDeps().cellWidth * STEP_NUMBER_FONT_RATIO),
          STEP_NUMBER_FONT_MAX
        )
      : 0
  );

  const badgeSize = $derived(scaledHeaderHeight * BADGE_SIZE_SCALE);
  const badgePadding = $derived(scaledHeaderHeight * BADGE_PADDING_SCALE);
  const badgeNumberFontSize = $derived(
    Math.round(badgeSize * BADGE_NUMBER_FONT_SCALE)
  );

  // Word title font size: shrinks for longer words
  const wordTitleFontSize = $derived.by(() => {
    const baseFontSize = Math.floor(
      scaledHeaderHeight * HEADER_WORD_FONT_SCALE
    );
    const word = getDeps().sequence.word;
    if (!word) return baseFontSize;

    const displayWord = simplifyAndTruncate(word, 16);
    let letterCount = 0;
    for (let i = 0; i < displayWord.length; i++) {
      const ch = displayWord[i];
      if (ch !== "-" && ch !== "." && ch !== " ") letterCount++;
    }
    if (letterCount <= 10) return baseFontSize;
    return Math.max(
      Math.floor(baseFontSize * (10 / letterCount)),
      Math.floor(scaledHeaderHeight * HEADER_WORD_FONT_MIN_SCALE)
    );
  });

  const footerFontSize = $derived(
    Math.floor(scaledFooterHeight * FOOTER_FONT_SCALE)
  );
  const footerMargin = $derived(
    Math.floor(scaledFooterHeight * FOOTER_MARGIN_SCALE)
  );

  // QR code grid position
  const qrGridPlacement = $derived.by(() => {
    const deps = getDeps();
    if (!deps.showQRCode || !deps.includeStartPlacement) return null;
    if (mandalaLayoutOverride) {
      return {
        gridColumn: mandalaLayoutOverride.qrPos.col,
        gridRow: mandalaLayoutOverride.qrPos.row,
      };
    }
    if (startPlacementLayout === "row") {
      if (effectiveColumns < 2) return null;
      return { gridColumn: effectiveColumns, gridRow: 1 };
    }
    if (effectiveRows < 2) return null;
    return { gridColumn: 1, gridRow: effectiveRows };
  });

  return {
    get isLongSequence() {
      return isLongSequence;
    },
    get needsScroll() {
      return needsScroll;
    },
    get usesAutomaticColumns() {
      return usesAutomaticColumns;
    },
    get autoFit() {
      return autoFit;
    },
    get startPlacementLayout() {
      return startPlacementLayout;
    },
    get baseColumns() {
      return baseColumns;
    },
    get baseRows() {
      return baseRows;
    },
    get effectiveColumns() {
      return effectiveColumns;
    },
    get effectiveRows() {
      return effectiveRows;
    },
    get mandalaLayoutOverride() {
      return mandalaLayoutOverride;
    },
    get mandalaPlacements() {
      return mandalaPlacements;
    },
    get containModel() {
      return containModel;
    },
    get previewAspectRatio() {
      return previewAspectRatio;
    },
    get headerFooterRefWidth() {
      return headerFooterRefWidth;
    },
    get scaledHeaderHeight() {
      return scaledHeaderHeight;
    },
    get scaledFooterHeight() {
      return scaledFooterHeight;
    },
    get stepNumFontSize() {
      return stepNumFontSize;
    },
    get badgeSize() {
      return badgeSize;
    },
    get badgePadding() {
      return badgePadding;
    },
    get badgeNumberFontSize() {
      return badgeNumberFontSize;
    },
    get wordTitleFontSize() {
      return wordTitleFontSize;
    },
    get footerFontSize() {
      return footerFontSize;
    },
    get footerMargin() {
      return footerMargin;
    },
    get qrGridPlacement() {
      return qrGridPlacement;
    },
    SCROLL_THRESHOLD,
  } as const;
}
