import { renderSmartBorders } from "./border-renderer.js";
import { calculateFooterHeight, calculateHeaderHeight } from "./dimensions.js";
import { getLayout } from "./layout-tables.js";
import { renderStepNumber } from "./step-number-renderer.js";

export interface SequenceCardExportProfile {
  version: "composer-card-v1";
  layout: "grid" | "strip";
  cellSize: number;
  padding: number;
  showStepNumbers: boolean;
  showWord: boolean;
  darkMode: boolean;
  showDifficulty: boolean;
  showFooter: boolean;
  showReversals: boolean;
  startPositionLayout: "row" | "column";
  level: number;
}

/** The stable Composer image-export baseline. Consumers opt in explicitly. */
export const COMPOSER_CARD_EXPORT_PROFILE_V1: Readonly<SequenceCardExportProfile> =
  {
    version: "composer-card-v1",
    layout: "grid",
    cellSize: 900,
    padding: 8,
    showStepNumbers: true,
    showWord: true,
    darkMode: false,
    showDifficulty: false,
    showFooter: false,
    showReversals: true,
    startPositionLayout: "row",
    level: 1,
  };

export interface SequenceCardCompositionOptions {
  layout: "grid" | "strip";
  cellSize: number;
  showStepNumbers: boolean;
  showWord: boolean;
  showDifficulty: boolean;
  showFooter: boolean;
  showReversals: boolean;
  darkMode: boolean;
  startPositionLayout: "row" | "column";
}

export interface SequenceCardLayout {
  width: number;
  height: number;
  columns: number;
  rows: number;
  headerHeight: number;
  footerHeight: number;
  gridStartY: number;
}

export interface SequenceCardCell {
  index: number;
  stepNumber: number;
  x: number;
  y: number;
  cellSize: number;
  baseOrientation: string;
}

export interface SequenceCardHeader {
  word: string;
}

export interface SequenceCardPipeline<TStep, TCanvas> {
  steps: TStep[];
  word: string;
  options: SequenceCardCompositionOptions;
  createCanvas: (width: number, height: number) => TCanvas;
  getContext: (canvas: TCanvas) => CanvasRenderingContext2D;
  toPng: (canvas: TCanvas) => Buffer | Promise<Buffer>;
  getStepNumber: (step: TStep) => number;
  applyReversals?: (steps: TStep[]) => TStep[];
  calculateDifficultyLevel: (steps: TStep[]) => number;
  renderPictograph: (
    ctx: CanvasRenderingContext2D,
    step: TStep,
    cell: SequenceCardCell,
  ) => Promise<void>;
  buildHeader: (steps: TStep[], word: string) => SequenceCardHeader;
  renderHeader?: (
    ctx: CanvasRenderingContext2D,
    header: SequenceCardHeader,
    layout: SequenceCardLayout,
    difficultyLevel: number,
  ) => Promise<void> | void;
  renderFooter?: (
    ctx: CanvasRenderingContext2D,
    layout: SequenceCardLayout,
  ) => Promise<void> | void;
}

export function calculateSequenceCardLayout(
  stepCount: number,
  options: Pick<
    SequenceCardCompositionOptions,
    | "layout"
    | "cellSize"
    | "showWord"
    | "showDifficulty"
    | "showFooter"
    | "startPositionLayout"
  >,
): SequenceCardLayout {
  const headerHeight =
    options.showWord || options.showDifficulty
      ? calculateHeaderHeight(options.cellSize)
      : 0;
  const footerHeight = options.showFooter
    ? calculateFooterHeight(options.cellSize)
    : 0;

  if (options.layout === "strip") {
    return {
      width: stepCount * options.cellSize,
      height: headerHeight + options.cellSize + footerHeight,
      columns: stepCount,
      rows: 1,
      headerHeight,
      footerHeight,
      gridStartY: headerHeight,
    };
  }

  const [columns, rows] = getLayout(stepCount - 1, options.startPositionLayout);
  return {
    width: columns * options.cellSize,
    height: headerHeight + rows * options.cellSize + footerHeight,
    columns,
    rows,
    headerHeight,
    footerHeight,
    gridStartY: headerHeight,
  };
}

export function calculateSequenceCardCell(
  index: number,
  columns: number,
  startPositionLayout: "row" | "column" = "column",
  layout: "grid" | "strip" = "grid",
): Pick<SequenceCardCell, "index" | "x" | "y"> & { row: number; col: number } {
  if (index === 0) return { index, row: 0, col: 0, x: 0, y: 0 };

  if (layout === "grid" && startPositionLayout === "row") {
    const stepIndex = index - 1;
    const row = Math.floor(stepIndex / columns) + 1;
    const col = stepIndex % columns;
    return { index, row, col, x: col, y: row };
  }

  const stepColumns = columns - 1;
  const stepIndex = index - 1;
  const row =
    stepIndex < stepColumns
      ? 0
      : Math.floor((stepIndex - stepColumns) / stepColumns) + 1;
  const col =
    stepIndex < stepColumns
      ? stepIndex + 1
      : ((stepIndex - stepColumns) % stepColumns) + 1;
  return { index, row, col, x: col, y: row };
}

export async function composeSequenceCard<TStep, TCanvas>(
  pipeline: SequenceCardPipeline<TStep, TCanvas>,
): Promise<Buffer> {
  const steps =
    pipeline.options.showReversals && pipeline.applyReversals
      ? pipeline.applyReversals(pipeline.steps)
      : pipeline.steps;
  if (steps.length === 0) throw new Error("No steps to render");

  const layout = calculateSequenceCardLayout(steps.length, pipeline.options);
  const canvas = pipeline.createCanvas(layout.width, layout.height);
  const ctx = pipeline.getContext(canvas);
  const { cellSize, darkMode } = pipeline.options;
  ctx.fillStyle = darkMode ? "#0a0a0f" : "#ffffff";
  ctx.fillRect(
    0,
    layout.headerHeight,
    layout.width,
    layout.height - layout.headerHeight - layout.footerHeight,
  );

  const occupiedCells = new Set<string>();
  const baseOrientation =
    pipeline.calculateDifficultyLevel(steps) === 3 ? "clock" : "in";
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    if (!step) continue;
    const position = calculateSequenceCardCell(
      index,
      layout.columns,
      pipeline.options.startPositionLayout,
      pipeline.options.layout,
    );
    const cell: SequenceCardCell = {
      index,
      stepNumber: pipeline.getStepNumber(step),
      x: position.x * cellSize,
      y: layout.gridStartY + position.y * cellSize,
      cellSize,
      baseOrientation,
    };
    occupiedCells.add(`${position.col},${position.row}`);
    try {
      await pipeline.renderPictograph(ctx, step, cell);
      if (pipeline.options.showStepNumbers) {
        renderStepNumber(
          ctx,
          cell.stepNumber,
          cell.x,
          cell.y,
          cellSize,
          darkMode,
        );
      }
    } catch {
      ctx.fillStyle = "rgba(255, 0, 0, 0.2)";
      ctx.fillRect(cell.x, cell.y, cellSize, cellSize);
      ctx.fillStyle = darkMode ? "#ff6b6b" : "#dc3545";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Error", cell.x + cellSize / 2, cell.y + cellSize / 2);
    }
  }

  renderSmartBorders(ctx, {
    columns: layout.columns,
    rows: layout.rows,
    cellSize,
    offsetY: layout.gridStartY,
    occupiedCells,
    darkMode,
  });

  const difficultyLevel = pipeline.calculateDifficultyLevel(steps);
  if (layout.headerHeight > 0 && pipeline.renderHeader) {
    await pipeline.renderHeader(
      ctx,
      pipeline.buildHeader(steps, pipeline.word),
      layout,
      difficultyLevel,
    );
  }
  if (
    pipeline.options.showFooter &&
    layout.footerHeight > 0 &&
    pipeline.renderFooter
  ) {
    await pipeline.renderFooter(ctx, layout);
  }
  return pipeline.toPng(canvas);
}
