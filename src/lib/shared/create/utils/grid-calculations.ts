/**
 * Grid Calculation Utilities
 *
 * Pure functions for calculating grid layout dimensions and positions.
 * These are NOT reactive - they take inputs and return outputs.
 * The component's $derived will call these with reactive values.
 */

import type { DeviceDetector } from "$lib/shared/device/services/device-detector";
import {
  getMaxColumnsForBeatCount,
  getStepFrameLayout,
} from "$lib/shared/create/domain/step-frame-layouts";

export interface GridLayout {
  rows: number;
  columns: number;
  totalColumns: number;
  cellSize: number;
  maxColumns: number;
}

export interface GridSizingConfig {
  minCellSize?: number;
  maxCellSize?: number;
  widthPaddingRatio?: number;
  heightPaddingRatio?: number;
  heightSizingRowThreshold?: number;
  columnBreakpoint?: number;
  isSideBySideLayout?: boolean;
  manualColumnCount?: number | null;
  /**
   * Keep a wide workspace on a predictable step-column count and size cells
   * from width so adding another row does not resize every existing step.
   * Explicit manual columns, used for LOOP alignment, still win.
   */
  stableColumnCount?: number | null;
  /** Cap step columns when the grid is narrower than columnBreakpoint. */
  narrowMaxColumns?: number | null;
  /** Let a narrow grid scroll vertically instead of shrinking cells to its height. */
  preferWidthSizingOnNarrow?: boolean;
  /**
   * Let a start placement or two-step build grow from width on a narrow surface,
   * even when that makes the cells taller than their host.
   *
   * This is useful in the full Composer workspace, where the user benefits from
   * a large early-build target and can scroll. Embedded side-by-side demos can
   * opt out so a narrow pane is not mistaken for a phone.
   */
  allowFewStepOverflowOnNarrow?: boolean;
  /**
   * Fit every step inside the container instead of holding a column count.
   *
   * A preview pane receives a finished sequence in a box it cannot grow, so
   * scrolling to reach step 13 of 16 is a defect, not an overflow. This mode
   * searches the column counts the container can afford and keeps whichever
   * one yields the largest cell that still fits BOTH dimensions — a 16-step
   * sequence in a wide, short card lands on 6x3, not the 4x4 that scrolls.
   *
   * Yields to legibility: when no column count fits the pane at minCellSize —
   * a phone card can afford roughly 32px a cell for sixteen steps — the
   * ordinary sizing policy comes back, so the reader gets big pictographs to
   * scroll instead of sixteen unreadable dots.
   *
   * Mutually exclusive with stableColumnCount by construction: pinning a
   * column count is for a workspace the user builds into one step at a time.
   */
  fitAllSteps?: boolean;
}

const DEFAULT_SIZING: Omit<
  Required<GridSizingConfig>,
  "manualColumnCount" | "stableColumnCount" | "narrowMaxColumns"
> & {
  manualColumnCount: number | null;
  stableColumnCount: number | null;
  narrowMaxColumns: number | null;
} = {
  minCellSize: 40, // Reduced from 50px to allow fitting more rows on small screens
  maxCellSize: 200,
  widthPaddingRatio: 0.95,
  heightPaddingRatio: 0.92, // Conservative to account for all container padding and gaps
  heightSizingRowThreshold: 8, // Try to fit up to 8 rows (32 steps with 4 cols) before allowing scroll
  columnBreakpoint: 650,
  isSideBySideLayout: false,
  manualColumnCount: null,
  stableColumnCount: null,
  narrowMaxColumns: null,
  preferWidthSizingOnNarrow: false,
  allowFewStepOverflowOnNarrow: true,
  fitAllSteps: false,
};

/**
 * Widest step-column count the fit-all search will consider. Matches the wide
 * layout table's ceiling; past it the +1 start column eats more width than the
 * extra column returns.
 */
const FIT_ALL_MAX_COLUMNS = 8;

export function calculateGridLayout(
  stepCount: number,
  containerWidth: number,
  containerHeight: number,
  _deviceDetector: DeviceDetector | null,
  config: GridSizingConfig = {}
): GridLayout {
  // Filter out undefined values from config to prevent overriding defaults with undefined
  const filteredConfig = Object.fromEntries(
    Object.entries(config).filter(([_, v]) => v !== undefined)
  );
  const sizing = { ...DEFAULT_SIZING, ...filteredConfig };

  // Mobile-adaptive sizing: on narrow screens with few pictographs, use width-based
  // sizing and a higher cell cap so pictographs are clearly visible. On mobile the
  // workspace container is short, so height-based sizing makes cells tiny. Width-based
  // sizing lets them fill the available space while the scroll container handles overflow.
  const isNarrowContainer =
    containerWidth > 0 && containerWidth < sizing.columnBreakpoint;
  const isMobileFewSteps =
    isNarrowContainer && stepCount <= 2 && sizing.allowFewStepOverflowOnNarrow;
  const stableWideColumnCount =
    containerWidth >= sizing.columnBreakpoint &&
    sizing.stableColumnCount !== null &&
    sizing.stableColumnCount > 0
      ? Math.max(1, Math.floor(sizing.stableColumnCount))
      : null;
  const fitSearch =
    sizing.fitAllSteps === true &&
    stepCount > 0 &&
    containerWidth > 0 &&
    containerHeight > 0
      ? findFitColumns()
      : null;
  // Fitting is worth having only while the cells stay legible. A pane too
  // small for the whole sequence at minCellSize gets the ordinary policy back:
  // big pictographs the reader scrolls, not sixteen unreadable dots. A phone
  // card offers 32px a cell — that is the fallback's case, not a fit.
  const fitAllSteps =
    fitSearch !== null && fitSearch.affordable >= sizing.minCellSize;
  const useWidthSizing =
    !fitAllSteps &&
    (stableWideColumnCount !== null ||
      isMobileFewSteps ||
      (isNarrowContainer && sizing.preferWidthSizingOnNarrow));
  // The start-placement-only cell may ignore its container height and overflow
  // into the scroller, but ONLY where that trade was designed: a narrow, short
  // container where height sizing would shrink the lone pictograph to nothing.
  // A wide desktop container reaching this path through stableColumnCount sized
  // the cell at 65% of a 1230px workspace — 759px inside a 497px wrapper, which
  // clipped the start pictograph and left the rest of the cell empty.
  const useUnboundedWidthSizing =
    !fitAllSteps &&
    (isMobileFewSteps ||
      (isNarrowContainer && sizing.preferWidthSizingOnNarrow));
  const narrowMaxColumns =
    isNarrowContainer &&
    sizing.narrowMaxColumns !== null &&
    sizing.narrowMaxColumns > 0
      ? Math.max(1, Math.floor(sizing.narrowMaxColumns))
      : null;
  if (isMobileFewSteps) {
    sizing.maxCellSize = Math.max(sizing.maxCellSize, 400);
  }

  // Handle edge case: no steps (just start placement)
  // This prevents division by zero and ensures proper single-cell sizing
  if (stepCount === 0) {
    // Single cell for start placement only
    let cellSize = sizing.maxCellSize;

    if (containerWidth > 0 && containerHeight > 0) {
      const availableWidth = containerWidth * sizing.widthPaddingRatio;
      const availableHeight = containerHeight * sizing.heightPaddingRatio;

      if (useUnboundedWidthSizing) {
        // Mobile: size by width only (65% of container), ignore height constraint.
        // The scroll container handles overflow if the cell is taller than the workspace.
        cellSize = Math.max(
          sizing.minCellSize,
          Math.floor(availableWidth * 0.65)
        );
      } else {
        cellSize = Math.max(
          sizing.minCellSize,
          Math.min(
            sizing.maxCellSize,
            Math.floor(Math.min(availableWidth, availableHeight))
          )
        );
      }
    }

    return {
      rows: 1,
      columns: 1,
      totalColumns: 1, // Just the start placement column
      cellSize,
      maxColumns: 1,
    };
  }

  /**
   * The size each axis can afford for a given step-column count, before any
   * min/max clamp. One owner for the gap and padding arithmetic so the fit
   * search and the sizing branches below can never drift apart.
   */
  function candidateGeometry(columns: number) {
    const rows = Math.ceil(stepCount / columns);
    const totalColumns = columns + 1; // +1 for start placement
    // These values mirror WorkspaceGrid's gap and scroll-wrapper padding.
    const gridGap = 1;
    const scrollContainerPadding = 8;
    const availableWidth =
      containerWidth * sizing.widthPaddingRatio -
      (totalColumns - 1) * gridGap -
      scrollContainerPadding;
    const availableHeight =
      containerHeight * sizing.heightPaddingRatio -
      (rows - 1) * gridGap -
      scrollContainerPadding;

    return {
      rows,
      totalColumns,
      maxCellWidth: availableWidth / totalColumns,
      maxCellHeight: availableHeight / rows,
    };
  }

  /**
   * The step-column count that shows every step at the largest cell the
   * container can afford. Pure geometry, so it can run before the sizing mode
   * is chosen — its verdict is what decides that mode.
   *
   * narrowMaxColumns deliberately does NOT cap this search. That cap exists to
   * stop width sizing from shrinking cells on a narrow screen; here the search
   * already maximizes cell size, so capping columns can only make them smaller
   * — on a 583x247 card it turned a 3x6 that fits into a scrolling 2x8.
   */
  function findFitColumns(): { columns: number; affordable: number } {
    // The affordable size is measured BEFORE minCellSize clamps it. Once the
    // pane is too small for the whole sequence every column count reports the
    // floor, and only the pre-clamp size still tells them apart. It has to: the
    // scroll wrapper hides horizontal overflow outright, so a layout that
    // spills sideways loses its last columns instead of gaining a scrollbar.
    const measure = (columns: number) => {
      const { rows, maxCellWidth, maxCellHeight } = candidateGeometry(columns);
      return {
        columns,
        rows,
        affordable: Math.min(maxCellWidth, maxCellHeight),
        // Empty step slots left in the last row. The start column is always
        // full — start placement first, then mandalas — so it does not count.
        emptySlots: columns * rows - stepCount,
      };
    };

    let best = measure(1);
    const columnCap = Math.min(stepCount, FIT_ALL_MAX_COLUMNS);
    for (let columns = 2; columns <= columnCap; columns++) {
      const candidate = measure(columns);
      // Size decides; a tie goes to the shortest grid, then to the one that
      // strands the fewest cells in its last row.
      const better =
        candidate.affordable > best.affordable ||
        (candidate.affordable === best.affordable &&
          (candidate.rows < best.rows ||
            (candidate.rows === best.rows &&
              candidate.emptySlots < best.emptySlots)));
      if (better) best = candidate;
    }
    return { columns: best.columns, affordable: best.affordable };
  }

  function calculateCandidate(maxColumns: number): GridLayout {
    const columns = Math.min(stepCount, maxColumns);
    const { rows, totalColumns, maxCellWidth, maxCellHeight } =
      candidateGeometry(columns);
    let cellSize = 160;

    if (containerWidth > 0 && containerHeight > 0) {
      if (fitAllSteps) {
        // Both dimensions bind, at any row count: the caller asked for the
        // whole sequence on screen, so the row budget never releases height.
        cellSize = Math.max(
          sizing.minCellSize,
          Math.min(
            sizing.maxCellSize,
            Math.floor(Math.min(maxCellWidth, maxCellHeight))
          )
        );
      } else if (useWidthSizing) {
        // A short mobile workspace may scroll. When readability owns the
        // sizing decision, use available width instead of crushing cells to
        // fit the workspace's shallow height.
        cellSize = Math.max(
          sizing.minCellSize,
          Math.min(sizing.maxCellSize, Math.floor(maxCellWidth))
        );
      } else if (rows <= sizing.heightSizingRowThreshold) {
        cellSize = Math.max(
          sizing.minCellSize,
          Math.min(
            sizing.maxCellSize,
            Math.floor(Math.min(maxCellWidth, maxCellHeight))
          )
        );
      } else {
        // Long sequences already need vertical scrolling, so width determines
        // their readable cell size.
        cellSize = Math.max(
          sizing.minCellSize,
          Math.min(sizing.maxCellSize, Math.floor(maxCellWidth))
        );
      }
    }

    return { rows, columns, totalColumns, cellSize, maxColumns };
  }

  if (sizing.manualColumnCount !== null && sizing.manualColumnCount > 0) {
    // Preserve explicit LOOP alignment unless the caller supplied a tighter
    // readability cap for a narrow workspace.
    const mobileCap = isNarrowContainer ? (narrowMaxColumns ?? 4) : 8;
    return calculateCandidate(Math.min(sizing.manualColumnCount, mobileCap));
  }

  if (fitAllSteps && fitSearch !== null) {
    return calculateCandidate(fitSearch.columns);
  }

  if (stableWideColumnCount !== null) {
    return calculateCandidate(stableWideColumnCount);
  }

  const wideMaxColumns = Math.min(
    getMaxColumnsForBeatCount(
      stepCount,
      sizing.isSideBySideLayout,
      containerWidth
    ),
    narrowMaxColumns ?? Number.POSITIVE_INFINITY
  );
  const standardMaxColumns = Math.min(
    getStepFrameLayout(stepCount, false).columns,
    4,
    narrowMaxColumns ?? Number.POSITIVE_INFINITY
  );
  const standardLayout = calculateCandidate(standardMaxColumns);

  if (wideMaxColumns === standardMaxColumns) return standardLayout;

  const wideLayout = calculateCandidate(wideMaxColumns);

  // A wide portrait screen is not automatically a short workspace. Compare
  // the square size that each layout can actually fit so a tall 751x1203
  // viewport gets four large step columns instead of eight small ones.
  // Once the standard layout exceeds the fit-all row budget, keep the wide
  // table so long sequences do not gain avoidable scrolling.
  if (standardLayout.rows > sizing.heightSizingRowThreshold) return wideLayout;
  return wideLayout.cellSize >= standardLayout.cellSize
    ? wideLayout
    : standardLayout;
}

/**
 * Calculate grid position (row, column) for step index
 */
export function calculateStepPosition(
  stepIndex: number,
  columns: number
): { row: number; column: number } {
  const row = Math.floor(stepIndex / columns) + 1;
  const column = (stepIndex % columns) + 2; // +2 because start placement is column 1
  return { row, column };
}

/**
 * Which diagonal band a cell sits on, counted out from the start placement.
 *
 * The generation reveal sweeps one front across the grid rather than filling a
 * list, so cells share a delay when they share a diagonal. Row plus column also
 * means the reveal's length tracks the diagonal (rows + columns) instead of the
 * step count: sixteen steps take one band longer than eight, not twice as long.
 *
 * The start placement occupies row 1, column 1, so it is band 0 and leads the
 * front without needing a case of its own.
 */
export function calculateStepWaveBand(
  stepIndex: number,
  columns: number
): number {
  const { row, column } = calculateStepPosition(stepIndex, columns);
  return row - 1 + (column - 1);
}

/**
 * Keep a grid vertically centered while it fits, then pin it to the top once
 * it needs to scroll. Returning the offset as a number lets the workspace
 * animate between row counts instead of relying on non-animatable auto margins.
 */
export function calculateGridVerticalCenterOffset(
  containerHeight: number,
  rows: number,
  cellSize: number,
  verticalPadding: number
): number {
  const availableHeight = Math.max(0, containerHeight - verticalPadding);
  const gridHeight = Math.max(1, rows) * Math.max(0, cellSize);
  return Math.max(0, (availableHeight - gridHeight) / 2);
}

/**
 * Timeline row assignment - groups steps into rows based on duration capacity
 */
export interface TimelineRow {
  /** Index of this row (0-based) */
  rowIndex: number;
  /** Steps in this row with their original indices */
  steps: Array<{ stepIndex: number; duration: number }>;
  /** Total duration units in this row */
  totalDuration: number;
}

/**
 * Calculate timeline row assignments based on duration capacity.
 * Steps are placed left-to-right, wrapping to a new row when adding
 * the next step would exceed the row's capacity.
 *
 * Example with capacity=4:
 * - Steps with durations [1, 2, 1, 1, 1, 1, 1, 1]
 * - Row 1: [1, 2, 1] = 4 units
 * - Row 2: [1, 1, 1, 1] = 4 units
 * - Row 3: [1] = 1 unit
 *
 * @param steps - Array of step data with optional duration (defaults to 1)
 * @param rowCapacity - Maximum duration units per row (default: 4)
 * @param hasStartPlacement - Whether to include start placement in first row
 * @returns Array of row assignments
 */
export function calculateTimelineRows(
  steps: readonly { duration?: number }[],
  rowCapacity: number = 4,
  hasStartPlacement: boolean = false
): TimelineRow[] {
  const rows: TimelineRow[] = [];

  // Start placement takes 1 unit from first row if present
  let currentRow: TimelineRow = {
    rowIndex: 0,
    steps: [],
    totalDuration: hasStartPlacement ? 1 : 0,
  };

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const duration = step?.duration ?? 1;

    // Would adding this step exceed capacity?
    // Always add at least one step per row (handles edge case of step > capacity)
    if (
      currentRow.totalDuration + duration > rowCapacity &&
      currentRow.steps.length > 0
    ) {
      rows.push(currentRow);
      currentRow = {
        rowIndex: rows.length,
        steps: [],
        totalDuration: 0,
      };
    }

    currentRow.steps.push({ stepIndex: i, duration });
    currentRow.totalDuration += duration;
  }

  // Push final row if it has content
  if (currentRow.steps.length > 0 || (hasStartPlacement && rows.length === 0)) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Calculate timeline row assignments based on a fixed step count per row.
 * Unlike calculateTimelineRows (which packs by duration capacity), this
 * always places exactly `stepsPerRow` steps in each row. The last row
 * may have fewer if steps don't divide evenly.
 *
 * Use this when the layout table prescribes a column count and the
 * sequence has mixed durations (e.g., swing). The CSS flexbox handles
 * proportional sizing within each row.
 *
 * @param steps - Array of step data with optional duration
 * @param stepsPerRow - Exact number of steps to place in each row
 * @returns Array of row assignments with actual duration totals
 */
export function calculateTimelineRowsByBeatCount(
  steps: readonly { duration?: number }[],
  stepsPerRow: number
): TimelineRow[] {
  if (stepsPerRow <= 0) stepsPerRow = 1;
  const rows: TimelineRow[] = [];

  for (let i = 0; i < steps.length; i += stepsPerRow) {
    const rowSteps: Array<{ stepIndex: number; duration: number }> = [];
    let totalDuration = 0;

    for (let j = i; j < Math.min(i + stepsPerRow, steps.length); j++) {
      const duration = steps[j]?.duration ?? 1;
      rowSteps.push({ stepIndex: j, duration });
      totalDuration += duration;
    }

    rows.push({
      rowIndex: rows.length,
      steps: rowSteps,
      totalDuration,
    });
  }

  return rows;
}

/**
 * Calculate the width multiplier for a timeline cell.
 * Duration=1 gets 1x base width, duration=2 gets 2x, etc.
 * This ensures consistent sizing - all duration=1 steps are the same width
 * regardless of what row they're in.
 *
 * @param stepDuration - Duration of the step
 * @returns Width multiplier (e.g., 1, 1.5, 2, etc.)
 */
export function getTimelineWidthMultiplier(stepDuration: number): number {
  return stepDuration ?? 1;
}

/**
 * Calculate responsive horizontal padding for timeline mode.
 * Scales with container width to provide appropriate breathing room:
 * - Small mobile (~320px): 8px total (4px each side)
 * - Medium screens (~600px): ~16px total
 * - Large desktop (~1200px): ~32px total
 * - 4K screens (2000px+): 48px total (capped)
 *
 * @param containerWidth - Container width in pixels
 * @returns Total horizontal padding (both sides combined)
 */
export function calculateTimelinePadding(containerWidth: number): number {
  if (containerWidth <= 0) return 8;

  // Use ~2.5% of container width, clamped between 8px and 48px
  const percentage = 0.025;
  const calculated = Math.round(containerWidth * percentage);

  const MIN_PADDING = 8;
  const MAX_PADDING = 48;

  return Math.max(MIN_PADDING, Math.min(MAX_PADDING, calculated));
}

/**
 * Calculate the base unit size for timeline mode.
 * This ensures exactly `rowCapacity` duration units fit per row.
 *
 * Unlike grid mode which has a maxCellSize constraint, timeline mode
 * sizes cells to fill the available width proportionally. Each duration
 * unit gets an equal share of the row width.
 *
 * The 48px touch floor is honored only while it still FITS. A row that hands
 * every unit 48px when the container can't afford it is wider than
 * .scroll-wrapper, whose `overflow-x: hidden` eats the right-most columns
 * outright — there is no horizontal scroll to reach them. A 40-step LOOP
 * aligned 10-per-row lost five whole columns that way below ~570px. Shrinking
 * cells is recoverable; deleting them from the screen is not.
 *
 * @param containerWidth - Available width in pixels
 * @param rowCapacity - Duration units per row (default: 4)
 * @param minSize - Minimum cell size for touch targets (default: 48)
 * @returns Unit size in pixels
 */
export function calculateTimelineUnitSize(
  containerWidth: number,
  rowCapacity: number = 4,
  minSize: number = 48
): number {
  if (containerWidth <= 0) return minSize;

  // Account for gaps between cells (1px each)
  // Maximum gaps = rowCapacity - 1 (if row is full)
  const gaps = (rowCapacity - 1) * 1;

  // Account for responsive horizontal breathing room padding
  const padding = calculateTimelinePadding(containerWidth);
  const availableWidth = containerWidth - gaps - padding;

  // Calculate unit size to fit exactly rowCapacity units
  // No max constraint - timeline cells should fill the available width
  const calculatedSize = Math.floor(availableWidth / rowCapacity);

  // Apply the touch floor only when the row can still fit inside the
  // container at that size; otherwise fitting wins (see the note above).
  const floor = Math.min(minSize, Math.max(1, calculatedSize));

  return Math.max(floor, calculatedSize);
}

/**
 * Clamp a width-based timeline unit size so `rowCount` rows fit the container
 * height without scrolling. `rowCount` must count EVERY rendered cell row —
 * including the start-placement cell when the sequence has no steps yet, which
 * renders one row all by itself. Skipping that case is how a start-only
 * sequence got a width-sized tile taller than its wrapper on a Fold in
 * portrait.
 *
 * @param widthBased - Unit size derived from available width
 * @param containerHeight - Container height in pixels
 * @param rowCount - Rendered cell rows (steps rows, or 1 for start-only)
 * @param popReserve - Padding reserved per edge for the selection pop (default 16)
 * @returns Unit size clamped to fit, never below the 48px touch floor
 */
export function clampTimelineUnitSizeToHeight(
  widthBased: number,
  containerHeight: number,
  rowCount: number,
  popReserve: number = 16
): number {
  if (containerHeight <= 0 || rowCount <= 0) return widthBased;

  const gaps = (rowCount - 1) * 1;
  const padding = 8;
  const availableHeight = containerHeight - 2 * popReserve - gaps - padding;
  const heightBased = Math.floor(availableHeight / rowCount);

  return Math.max(48, Math.min(widthBased, heightBased));
}
