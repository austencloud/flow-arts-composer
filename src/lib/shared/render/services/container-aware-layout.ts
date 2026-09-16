/**
 * Container-Aware Layout
 *
 * The "Auto" complement to the static `layout-calculator.ts` table. Given the
 * live container's raw pixel size, picks the columns×rows (and start-cell
 * placement) that renders the ChoreoCard as large as possible — cells are
 * square, so maximizing the cell edge maximizes the card area.
 *
 * Pure / DOM-free / deterministic. Interactive viewers supply their live
 * container. Export callers can pass the winning layout through to the PNG
 * renderer so the downloaded card preserves the preview's geometry.
 *
 * The grid-shape formulas here mirror `renderAllCells` and
 * `calculateGridPlacement` exactly, so a best-fit layout and the cells rendered
 * into it never disagree. The header/footer-fraction math mirrors the layout
 * state factory's `previewAspectRatio`, so both size the card by one formula.
 */

import {
  HEADER_HEIGHT_DIVISOR,
  FOOTER_HEIGHT_DIVISOR,
} from "@tka/render-composition";
import { calculateTimelineRowsByBeatCount } from "$lib/shared/create/utils/grid-calculations";
import { getCanonicalCardStepColumnCounts } from "$lib/shared/render/services/card-step-column-options";

export type StartPlacement = "row" | "column" | "none";

export interface FitLayout {
  /** Total grid columns (includes the start column under "column" placement). */
  cols: number;
  /** Total grid rows (includes the start row under "row" placement). */
  rows: number;
  /** Where the start cell sits. "none" when the start position is excluded. */
  startPlacement: StartPlacement;
  /**
   * Physical width in square pictograph units. Uniform grids use `cols`.
   * Held beats can be wider than one unit, so their visual width can differ
   * from the structural column count used to group steps.
   */
  widthUnits?: number;
}

/** A measured Auto winner tied to the sequence length it was evaluated for. */
export interface ResolvedAutoLayout extends FitLayout {
  stepCount: number;
}

export interface BestFitInput {
  stepCount: number;
  /**
   * Optional duration for each step. When any duration differs from 1, Auto
   * scores the same proportional timeline rows the card renders.
   */
  stepDurations?: readonly number[];
  /**
   * Whether the returned grid includes the Start lane. Auto still scores the
   * full card when this is false so hiding Start cannot repack every beat.
   */
  includeStartPlacement: boolean;
  /** Raw container width in px (NOT the aspect-fitted contained width). */
  containerWidth: number;
  /** Raw container height in px. */
  containerHeight: number;
  showHeader: boolean;
  showFooter: boolean;
  /** QR needs a reserved empty info cell — constrains eligible shapes. */
  showQRCode: boolean;
}

/** Cell-edge ties within this many px are treated as equal (stability + float noise). */
const CELL_EDGE_EPSILON = 0.5;

/** Long side / short side limit for a canonical step grid. */
const MAX_CANONICAL_STEP_GRID_RATIO = 2.5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Grid dimensions for a candidate step-column count. Mirrors the exact
 * convention in `calculateGridPlacement` / `renderAllCells`:
 *  - no start:  cols = sc,     rows = ceil(steps / sc)
 *  - row:       cols = sc,     rows = 1 + ceil(steps / sc)     (start owns row 1)
 *  - column:    cols = sc + 1, rows = 1 + ceil((steps - firstRow) / sc)
 *               where firstRow = min(sc, steps)                (start owns col 1)
 */
function gridShape(
  stepCount: number,
  stepCols: number,
  includeStartPlacement: boolean,
  placement: StartPlacement
): { cols: number; rows: number } {
  const sc = Math.max(1, stepCols);
  if (!includeStartPlacement || placement === "none") {
    return { cols: sc, rows: Math.max(1, Math.ceil(stepCount / sc)) };
  }
  if (placement === "row") {
    return { cols: sc, rows: 1 + Math.ceil(stepCount / sc) };
  }
  // column placement
  const firstRow = Math.min(sc, stepCount);
  const remaining = stepCount - firstRow;
  return { cols: sc + 1, rows: 1 + Math.ceil(remaining / sc) };
}

/**
 * Empty cells in the step region only — the count of unfilled cells in the last
 * step row. This EXCLUDES the start's own lane (the full row under "row"
 * placement or full column under "column" placement), whose leftover cells host
 * the mandala / are the start's dedicated track and read as structural, not as
 * an awkward gap. A trailing hole in the step grid is the "upward space" defect;
 * a hole in the start lane is not. The picker prices only this.
 *
 * Step grid is `stepCols × stepRows`:
 *  - none:   cols × rows
 *  - row:    cols × (rows - 1)   (start owns row 1)
 *  - column: (cols - 1) × rows   (start owns column 1)
 */
function stepTrailingEmpties(
  cols: number,
  rows: number,
  stepCount: number,
  includeStartPlacement: boolean,
  placement: StartPlacement
): number {
  const stepCols =
    includeStartPlacement && placement === "column" ? cols - 1 : cols;
  const stepRows =
    includeStartPlacement && placement === "row" ? rows - 1 : rows;
  return stepCols * stepRows - stepCount;
}

/**
 * The card's height in cell-units, including the header/footer fractions.
 * Matches the layout state factory's `previewAspectRatio` math so the picker
 * and the renderer agree on the card's aspect ratio.
 */
export function cardHeightInCells(
  cols: number,
  rows: number,
  showHeader: boolean,
  showFooter: boolean
): number {
  const hfScale = cols >= 3 ? 1 : cols / 3;
  const headerFraction = showHeader ? (1 / HEADER_HEIGHT_DIVISOR) * hfScale : 0;
  const footerFraction = showFooter ? (1 / FOOTER_HEIGHT_DIVISOR) * hfScale : 0;
  return rows + headerFraction + footerFraction;
}

interface Candidate {
  cols: number;
  rows: number;
  startPlacement: StartPlacement;
  widthUnits: number;
  /** Beat-only geometry retained when the Start lane is hidden. */
  stepCols: number;
  stepRows: number;
  stepWidthUnits: number;
  cellEdge: number;
  /** Unfilled cells in the last STEP row (start lane excluded). */
  stepTrailing: number;
  /** Total empty cells incl. start-lane holes — a soft tiebreak only. */
  wasted: number;
  balance: number;
}

/**
 * A divisor is only useful to Auto when it also produces a readable step grid.
 * This keeps 16 steps on 4x4 instead of letting a tall container pull it into
 * 2x8, while 8 can still rotate between 2x4 and 4x2. Short cards may use a
 * single row because three or four cells do not read as a strip.
 */
function hasReadableStepGrid(candidate: Candidate, stepCount: number): boolean {
  if (stepCount <= 4) return true;
  const shortSide = Math.min(candidate.stepWidthUnits, candidate.stepRows);
  const longSide = Math.max(candidate.stepWidthUnits, candidate.stepRows);
  return shortSide > 0 && longSide / shortSide <= MAX_CANONICAL_STEP_GRID_RATIO;
}

/**
 * True when `a` is a strictly better fit than `b`.
 *
 * The primary objective is literal pictograph size: maximize the square cell
 * edge. Only candidates within the sub-pixel stability band use geometry
 * tiebreakers: fewer trailing step gaps, fewer total empty cells, then balance.
 * Exact rotational ties put Start in the left column because the header and
 * footer already form horizontal bands.
 */
function isBetter(a: Candidate, b: Candidate): boolean {
  if (a.cellEdge > b.cellEdge + CELL_EDGE_EPSILON) return true;
  if (b.cellEdge > a.cellEdge + CELL_EDGE_EPSILON) return false;
  if (a.stepTrailing !== b.stepTrailing) return a.stepTrailing < b.stepTrailing;
  if (a.wasted !== b.wasted) return a.wasted < b.wasted;
  if (a.balance !== b.balance) return a.balance < b.balance;
  if (a.startPlacement !== b.startPlacement) {
    return a.startPlacement === "column";
  }
  return false;
}

/**
 * Pick the columns×rows (and start placement) that renders the card largest in
 * the given container. Returns `null` when there is nothing to fit (non-positive
 * dimensions, no steps) or no candidate can host a required QR slot — the caller
 * then falls back to the static table.
 */
export function pickBestFitLayout(input: BestFitInput): FitLayout | null {
  const {
    stepCount,
    stepDurations,
    includeStartPlacement,
    containerWidth,
    containerHeight,
    showHeader,
    showFooter,
    showQRCode,
  } = input;

  if (stepCount < 1) return null;
  if (!(containerWidth > 0) || !(containerHeight > 0)) return null;

  // Start visibility is presentation, not permission to repack the beats.
  // Score the same full-card candidates in both states, then strip the winning
  // Start lane from the returned geometry when the user hides it.
  const placements: StartPlacement[] = ["row", "column"];

  const durations = Array.from(
    { length: stepCount },
    (_, index) => stepDurations?.[index] ?? 1
  );
  const hasMixedDurations = durations.some(
    (duration) => Math.abs(duration - 1) > 0.001
  );
  const durationSteps = hasMixedDurations
    ? durations.map((duration) => ({ duration }))
    : null;
  const usedCells = stepCount + 1;
  const candidates: Candidate[] = [];

  for (let sc = 1; sc <= stepCount; sc++) {
    for (const placement of placements) {
      let cols: number;
      let rows: number;
      let widthUnits: number;
      let stepRows: number;
      let stepWidthUnits: number;

      if (durationSteps) {
        const timelineRows = calculateTimelineRowsByBeatCount(
          durationSteps,
          sc
        );
        const maxStepUnits = Math.max(
          1,
          ...timelineRows.map((row) => row.totalDuration)
        );
        stepRows = timelineRows.length;
        stepWidthUnits = maxStepUnits;

        if (placement === "row") {
          cols = sc;
          rows = timelineRows.length + 1;
          // Start and QR occupy opposite ends of the top lane.
          widthUnits = Math.max(maxStepUnits, showQRCode ? 2 : 1);
        } else {
          cols = sc + 1;
          // QR sits below Start in the left lane.
          rows = Math.max(timelineRows.length, showQRCode ? 2 : 1);
          widthUnits = maxStepUnits + 1;
        }
      } else {
        const shape = gridShape(stepCount, sc, true, placement);
        cols = shape.cols;
        rows = shape.rows;
        widthUnits = cols;
        stepRows = Math.max(1, Math.ceil(stepCount / sc));
        stepWidthUnits = sc;
      }

      // The QR code is functional (the scan target), so it must have a reserved
      // empty slot in the reference layout. Row placement parks it at (cols, 1);
      // column at (1, rows). Keeping this constraint while Start is hidden is
      // what makes showing it again restore the same beat grid.
      if (showQRCode && !durationSteps) {
        if (placement === "row" && cols < 2) continue;
        if (placement === "column" && rows < 2) continue;
      }

      const heightCells = cardHeightInCells(
        widthUnits,
        rows,
        showHeader,
        showFooter
      );
      const cellEdge = Math.min(
        containerWidth / widthUnits,
        containerHeight / heightCells
      );

      candidates.push({
        cols,
        rows,
        startPlacement: placement,
        widthUnits,
        stepCols: sc,
        stepRows,
        stepWidthUnits,
        cellEdge,
        stepTrailing: stepTrailingEmpties(
          cols,
          rows,
          stepCount,
          true,
          placement
        ),
        wasted: cols * rows - usedCells,
        balance: Math.abs(widthUnits - rows),
      });
    }
  }

  if (candidates.length === 0) return null;

  // Auto chooses only from the same exact-divisor counts exposed by the card's
  // Columns control when those counts contain a readable shape. Prime and
  // awkward lengths keep the exhaustive fallback instead of being forced into
  // a one-row or one-column card.
  const canonicalStepColumns = new Set(
    getCanonicalCardStepColumnCounts(stepCount)
  );
  const canonicalCandidates = candidates.filter(
    (candidate) =>
      canonicalStepColumns.has(candidate.stepCols) &&
      hasReadableStepGrid(candidate, stepCount)
  );
  const eligibleCandidates =
    canonicalCandidates.length > 0 ? canonicalCandidates : candidates;

  let best: Candidate | null = null;
  for (const candidate of eligibleCandidates) {
    if (!best || isBetter(candidate, best)) best = candidate;
  }

  if (!best) return null;
  if (!includeStartPlacement) {
    return {
      cols: best.stepCols,
      rows: best.stepRows,
      startPlacement: "none",
      widthUnits: best.stepWidthUnits,
    };
  }
  return {
    cols: best.cols,
    rows: best.rows,
    startPlacement: best.startPlacement,
    widthUnits: best.widthUnits,
  };
}

/** Convert a complete Auto layout back to the panel's STEP-column convention. */
export function getStepColumnsForLayout(layout: FitLayout): number {
  return layout.startPlacement === "column" ? layout.cols - 1 : layout.cols;
}

/**
 * Column count for a scrolling long sequence. The card fills the container
 * width and scrolls vertically, so the column count is chosen from width alone:
 * a wider container shows more (smaller-scroll) columns, a narrower one fewer.
 * Returns the legacy default of 5 when the width is not yet known, preserving
 * the first pre-measure frame.
 */
export function pickScrollColumns(
  containerWidth: number,
  opts?: { min?: number; max?: number; targetCellPx?: number }
): number {
  const { min = 4, max = 7, targetCellPx = 130 } = opts ?? {};
  if (!(containerWidth > 0)) return 5;
  return clamp(Math.round(containerWidth / targetCellPx), min, max);
}
