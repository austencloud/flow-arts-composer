const STEP_COLUMN_CANDIDATES = [1, 2, 4, 6, 8] as const;

export const FUSE_LIVE_GRID_GAP = 1;

export interface FuseWorkspaceSplitInput {
  availableWidth: number;
  cardBoxHeight: number;
  stepCount: number;
  previewIdealWidth: number;
  minLeft: number;
  maxLeft: number;
  cardHorizontalChrome: number;
}

export interface FuseWorkspaceSplit {
  splitPx: number;
  stepColumns: number;
}

export interface FuseTallPortraitInput {
  width: number;
  height: number;
  mobileMaxWidth: number;
  splitMinWidth: number;
  narrowMinHeight: number;
  splitMinHeight: number;
  minAspectRatio: number;
}

export interface FuseWingWorkspaceInput {
  /** Width inside the workspace padding. */
  availableWidth: number;
  /** Height of the complete Fuse slot, including its header. */
  availableHeight: number;
  /** Width the center result needs to use the available height. */
  previewIdealWidth: number;
  /** Smallest usable width for each full source card. */
  sourceFloor: number;
  /** Stops source notation from consuming width the result can use better. */
  sourceCap: number;
  /** Smallest useful center result. */
  previewFloor: number;
  /** Zero while Recipe is closed. */
  recipeWidth: number;
  /** Gap between adjacent visible columns. */
  columnGap: number;
  /** Short workspaces keep the stacked source column. */
  minHeight: number;
}

export interface FuseWingWorkspace {
  fits: boolean;
  sourceWidth: number;
  previewWidth: number;
}

/**
 * Identifies a narrow slot with enough vertical room to show both source paths
 * and the result instead of spending the entire surface on the compact hero.
 */
export function fitsFuseTallPortraitWorkspace(
  input: FuseTallPortraitInput
): boolean {
  const {
    width,
    height,
    mobileMaxWidth,
    splitMinWidth,
    narrowMinHeight,
    splitMinHeight,
    minAspectRatio,
  } = input;
  if (width <= 0 || height <= 0) return false;

  const requiredHeight =
    width >= splitMinWidth ? splitMinHeight : narrowMinHeight;

  return (
    width < mobileMaxWidth &&
    height >= requiredHeight &&
    height / width >= minAspectRatio
  );
}

/**
 * Seats Left and Right on opposite sides of the combined result when all three
 * can remain useful. Recipe counts as a fourth column while it is open.
 *
 * The result asks for the width that lets its square animation use the available
 * height. Both source cards then share what remains equally, until they reach a
 * comfortable cap; any further width belongs to the result instead of turning
 * eight pictographs into two huge, sparse side rails.
 */
export function resolveFuseWingWorkspace(
  input: FuseWingWorkspaceInput
): FuseWingWorkspace {
  const availableWidth = Math.max(0, input.availableWidth);
  const recipeWidth = Math.max(0, input.recipeWidth);
  const columnGap = Math.max(0, input.columnGap);
  const sourceFloor = Math.max(0, input.sourceFloor);
  const sourceCap = Math.max(sourceFloor, input.sourceCap);
  const previewFloor = Math.max(0, input.previewFloor);
  const visibleGaps = recipeWidth > 0 ? 3 : 2;
  const workWidth = Math.max(
    0,
    availableWidth - recipeWidth - visibleGaps * columnGap
  );
  const fits =
    input.availableHeight >= input.minHeight &&
    workWidth >= 2 * sourceFloor + previewFloor;

  if (!fits) {
    return { fits: false, sourceWidth: 0, previewWidth: workWidth };
  }

  const largestUsefulPreview = Math.max(
    previewFloor,
    workWidth - 2 * sourceFloor
  );
  const targetPreview = Math.min(
    largestUsefulPreview,
    Math.max(previewFloor, input.previewIdealWidth)
  );
  const sourceWidth = Math.round(
    Math.min(sourceCap, Math.max(sourceFloor, (workWidth - targetPreview) / 2))
  );

  return {
    fits: true,
    sourceWidth,
    previewWidth: Math.max(0, workWidth - 2 * sourceWidth),
  };
}

function stepColumnCandidates(stepCount: number): readonly number[] {
  const twoRowCeiling = Math.max(1, Math.ceil(stepCount / 2));
  return STEP_COLUMN_CANDIDATES.filter((columns) => columns <= twoRowCeiling);
}

function emptyStepCells(stepCount: number, stepColumns: number): number {
  return Math.max(
    0,
    Math.ceil(stepCount / stepColumns) * stepColumns - stepCount
  );
}

function clampSplit(px: number, minLeft: number, maxLeft: number): number {
  const safeMax = Math.max(minLeft, maxLeft);
  return Math.round(Math.min(safeMax, Math.max(minLeft, px)));
}

export function getFittedFuseCellSize(
  availableWidth: number,
  availableHeight: number,
  columns: number,
  rows: number,
  gap = FUSE_LIVE_GRID_GAP
): number {
  const safeColumns = Math.max(1, Math.floor(columns));
  const safeRows = Math.max(1, Math.floor(rows));
  const safeGap = Math.max(0, gap);
  const cellWidth =
    (Math.max(0, availableWidth) - (safeColumns - 1) * safeGap) / safeColumns;
  const cellHeight =
    (Math.max(0, availableHeight) - (safeRows - 1) * safeGap) / safeRows;

  return Math.max(0, Math.min(cellWidth, cellHeight));
}

export function getFuseSourceCellSize(
  leftWidth: number,
  cardBoxHeight: number,
  stepCount: number,
  stepColumns: number,
  cardHorizontalChrome: number
): number {
  const gridColumns = stepColumns + 1;
  const rows = Math.max(Math.ceil(stepCount / stepColumns), 2);
  const boxWidth = Math.max(0, leftWidth - cardHorizontalChrome);
  return getFittedFuseCellSize(boxWidth, cardBoxHeight, gridColumns, rows);
}

export function getBestFuseStepColumns(
  leftWidth: number,
  cardBoxHeight: number,
  stepCount: number,
  cardHorizontalChrome: number
): number {
  const candidates = stepColumnCandidates(stepCount);
  let best = candidates[0] ?? 1;
  let bestCell = -1;

  for (const stepColumns of candidates) {
    const cell = getFuseSourceCellSize(
      leftWidth,
      cardBoxHeight,
      stepCount,
      stepColumns,
      cardHorizontalChrome
    );
    if (
      cell > bestCell + 0.5 ||
      (Math.abs(cell - bestCell) <= 0.5 &&
        (emptyStepCells(stepCount, stepColumns) <
          emptyStepCells(stepCount, best) ||
          (emptyStepCells(stepCount, stepColumns) ===
            emptyStepCells(stepCount, best) &&
            stepColumns > best)))
    ) {
      bestCell = cell;
      best = stepColumns;
    }
  }

  return best;
}

export type FuseContextPlacement = "column" | "row";

export interface FuseSideCardGrid {
  stepColumns: number;
  /**
   * Where Start and the mandala sit. A column beside the steps suits a short,
   * wide card; a row above two step columns suits a tall side card, where a
   * context column would strand empty cells between Start and the mandala.
   */
  contextPlacement: FuseContextPlacement;
  cellSize: number;
}

/**
 * Fits a full source card that sizes itself from its own stage (the wide
 * workbench's side cards). The ordinary context column is scored against a
 * context row over exactly two step columns, where Start and the mandala fill
 * that row with nothing left over, and the larger cell wins.
 */
export function resolveFuseSideCardGrid(
  stageWidth: number,
  stageHeight: number,
  stepCount: number,
  gap = FUSE_LIVE_GRID_GAP
): FuseSideCardGrid {
  const columnSteps = getBestFuseStepColumns(
    stageWidth,
    stageHeight,
    stepCount,
    0
  );
  const columnCell = getFittedFuseCellSize(
    stageWidth,
    stageHeight,
    columnSteps + 1,
    Math.max(Math.ceil(stepCount / columnSteps), 2),
    gap
  );

  if (stepCount < 4) {
    return {
      stepColumns: columnSteps,
      contextPlacement: "column",
      cellSize: columnCell,
    };
  }

  const rowCell = getFittedFuseCellSize(
    stageWidth,
    stageHeight,
    2,
    Math.ceil(stepCount / 2) + 1,
    gap
  );

  return rowCell > columnCell + 0.5
    ? { stepColumns: 2, contextPlacement: "row", cellSize: rowCell }
    : {
        stepColumns: columnSteps,
        contextPlacement: "column",
        cellSize: columnCell,
      };
}

export interface FuseRecipeColumnFitInput {
  /** Recipe column's narrowest usable width. */
  recipeMinWidth: number;
  /** Path column's HARD floor, not its comfortable one. */
  pathHardMinWidth: number;
  /** Result canvas's floor. */
  canvasFloor: number;
  /** Gap between two adjacent workspace columns. */
  columnGap: number;
}

/**
 * The narrowest workspace that can hold the recipe as a third column.
 *
 * Each panel's HARD floor, deliberately. The alternative host is a sheet that
 * overlays the workspace from the right and covers most of the result preview,
 * so a workspace where the three columns merely get tight still shows the user
 * more than one where the animation they are tuning is behind the panel. Gating
 * on the path column's COMFORTABLE width instead put this seam ~220px too high,
 * which sent a 1462px workspace — 4K at 150% scaling, window not maximized — to
 * the sheet.
 */
export function fuseRecipeColumnFloor(input: FuseRecipeColumnFitInput): number {
  return (
    input.recipeMinWidth +
    input.pathHardMinWidth +
    input.canvasFloor +
    2 * input.columnGap
  );
}

export function fitsFuseRecipeColumn(
  containerWidth: number,
  input: FuseRecipeColumnFitInput
): boolean {
  return containerWidth >= fuseRecipeColumnFloor(input);
}

/**
 * Finds the desktop seam where both visual work areas reach the same share of
 * their height-derived ideal. The source ideal is the width that makes its
 * pictograph cells square. The result ideal is the width that lets its square
 * animation frame use the available height. Any surplus or deficit is shared
 * in that ratio, so neither pane grows by starving the other.
 */
export function resolveBalancedFuseWorkspaceSplit(
  input: FuseWorkspaceSplitInput
): FuseWorkspaceSplit {
  const {
    availableWidth,
    cardBoxHeight,
    stepCount,
    previewIdealWidth,
    minLeft,
    maxLeft,
    cardHorizontalChrome,
  } = input;
  const candidates = stepColumnCandidates(stepCount);
  const fallback = clampSplit(availableWidth * 0.5, minLeft, maxLeft);

  if (availableWidth <= 0 || cardBoxHeight <= 0 || previewIdealWidth <= 0) {
    return {
      splitPx: fallback,
      stepColumns: getBestFuseStepColumns(
        fallback,
        Math.max(0, cardBoxHeight),
        stepCount,
        cardHorizontalChrome
      ),
    };
  }

  let bestSplit = fallback;
  let bestColumns = candidates[0] ?? 1;
  let bestCell = -1;
  let bestPreviewSize = -1;

  for (const stepColumns of candidates) {
    const gridColumns = stepColumns + 1;
    const rows = Math.max(Math.ceil(stepCount / stepColumns), 2);
    const sourceIdealWidth =
      (gridColumns / rows) * cardBoxHeight + cardHorizontalChrome;
    const idealTotal = sourceIdealWidth + previewIdealWidth;
    const negotiatedSplit =
      idealTotal > 0
        ? (availableWidth * sourceIdealWidth) / idealTotal
        : fallback;
    const splitPx = clampSplit(negotiatedSplit, minLeft, maxLeft);
    const cell = getFuseSourceCellSize(
      splitPx,
      cardBoxHeight,
      stepCount,
      stepColumns,
      cardHorizontalChrome
    );
    const previewSize = Math.min(
      previewIdealWidth,
      Math.max(0, availableWidth - splitPx)
    );

    if (
      cell > bestCell + 0.5 ||
      (Math.abs(cell - bestCell) <= 0.5 &&
        (previewSize > bestPreviewSize + 0.5 ||
          (Math.abs(previewSize - bestPreviewSize) <= 0.5 &&
            (emptyStepCells(stepCount, stepColumns) <
              emptyStepCells(stepCount, bestColumns) ||
              (emptyStepCells(stepCount, stepColumns) ===
                emptyStepCells(stepCount, bestColumns) &&
                stepColumns > bestColumns)))))
    ) {
      bestCell = cell;
      bestPreviewSize = previewSize;
      bestSplit = splitPx;
      bestColumns = stepColumns;
    }
  }

  return { splitPx: bestSplit, stepColumns: bestColumns };
}

/** What one workspace column asks for, and what it will settle for. */
export interface FuseColumnDemand {
  /** Width the column wants when nothing else is competing for the space. */
  comfort: number;
  /** Width below which the column stops being usable. */
  floor: number;
}

export interface FuseColumnDemands {
  path: FuseColumnDemand;
  canvas: FuseColumnDemand;
  recipe: FuseColumnDemand;
}

export interface FuseColumnWidths {
  path: number;
  canvas: number;
  recipe: number;
}

/**
 * Settles what the three workspace columns get when they cannot all have the
 * width they want.
 *
 * Opening the recipe costs the workspace a whole column, and that cost has to
 * land somewhere. Left to the seam solver alone it landed almost entirely on
 * the result: the path column had a comfortable width it refused to go below
 * and the recipe took a flat share of the window, so the animation — the one
 * panel showing what every control in the recipe is doing — was the only thing
 * that shrank, by more than twice what the paths gave up.
 *
 * So each column states two widths: what it wants, and what it can survive on.
 * When the three wants exceed the space, every column gives up the same
 * fraction of the room it has between those two numbers. A column already near
 * its floor barely moves; one with room to spare carries more of the cost. No
 * column is the shock absorber for the other two.
 *
 * Pass a recipe demand of zero when the recipe is closed — it then neither
 * takes space nor counts as a party to the negotiation.
 */
export function negotiateFuseColumnWidths(
  availableWidth: number,
  demands: FuseColumnDemands
): FuseColumnWidths {
  const keys = ["path", "canvas", "recipe"] as const;
  const totalComfort = keys.reduce((sum, key) => sum + demands[key].comfort, 0);
  const shortfall = totalComfort - availableWidth;

  if (shortfall <= 0) {
    return {
      path: Math.round(demands.path.comfort),
      canvas: Math.round(demands.canvas.comfort),
      recipe: Math.round(demands.recipe.comfort),
    };
  }

  const give = (key: (typeof keys)[number]) =>
    Math.max(0, demands[key].comfort - demands[key].floor);
  const totalGive = keys.reduce((sum, key) => sum + give(key), 0);
  // Below every floor at once there is nothing left to negotiate: the fit gate
  // should already have sent the recipe to the sheet, so hand back the floors
  // and let the grid clip rather than inventing negative widths.
  if (totalGive <= 0) {
    return {
      path: Math.round(demands.path.floor),
      canvas: Math.round(demands.canvas.floor),
      recipe: Math.round(demands.recipe.floor),
    };
  }

  const conceded = Math.min(shortfall, totalGive) / totalGive;
  const settle = (key: (typeof keys)[number]) =>
    Math.round(demands[key].comfort - give(key) * conceded);

  return {
    path: settle("path"),
    canvas: settle("canvas"),
    recipe: settle("recipe"),
  };
}
