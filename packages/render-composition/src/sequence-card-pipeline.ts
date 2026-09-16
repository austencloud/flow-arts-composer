import { renderSmartBorders } from "./border-renderer.js";
import { calculateCardSurface } from "./card-surface-layout.js";
import {
  getCardFrameContentInset,
  paintCardFrame,
  type CardFrameOptions,
} from "./card-frame.js";
import { getLayout } from "./layout-tables.js";
import { renderStepNumber } from "./step-number-renderer.js";
import {
  renderDurationBadge,
  stepHasDurationBadge,
} from "./duration-badge.js";
import type { CardMandalaPlacement } from "./card-mandala.js";

/** Steps needed (start position excluded) before info cells host a mandala. */
export const MANDALA_MIN_STEP_COUNT = 4;

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
  showMandala: boolean;
  showReversals: boolean;
  startPlacementLayout: "row" | "column";
  level: number;
}

/** The stable Composer image-export baseline. Consumers opt in explicitly. */
export const COMPOSER_CARD_EXPORT_PROFILE_V1: Readonly<SequenceCardExportProfile> =
  {
    version: "composer-card-v1",
    layout: "grid",
    cellSize: 300,
    padding: 8,
    showStepNumbers: true,
    showWord: true,
    darkMode: false,
    showDifficulty: false,
    showFooter: false,
    showMandala: true,
    showReversals: true,
    startPlacementLayout: "row",
    level: 1,
  };

export interface SequenceCardCompositionOptions {
  exportProfile?: "composer" | "print";
  frame?: CardFrameOptions;
  columnCount?: number;
  gridCentering?: "optical" | "geometric";
  showLoopGlyph?: boolean;
  layout: "grid" | "strip";
  cellSize: number;
  showStepNumbers: boolean;
  showWord: boolean;
  showDifficulty: boolean;
  showFooter: boolean;
  showMandala: boolean;
  showReversals: boolean;
  darkMode: boolean;
  startPlacementLayout: "row" | "column";
  /** Reserve the Composer's QR slot; the pipeline's `renderQRCode` hook fills it. */
  showQRCode?: boolean;
  /** Print cards: TnD accent tint on the side bands, header and footer. */
  accentColor?: string;
  /** 0–1 alpha for the accent tint; the Composer default is 0x18/255. */
  accentTintOpacity?: number;
}

export interface SequenceCardLayout {
  cellSize?: number;
  gridStartX?: number;
  indicatorSizeScale?: number;
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
  /** Counts a step holds for; anything other than 1 draws the "N×" badge. */
  getStepDuration?: (step: TStep) => number | undefined;
  applyReversals?: (steps: TStep[]) => TStep[];
  calculateDifficultyLevel: (steps: TStep[]) => number;
  renderPictograph: (
    ctx: CanvasRenderingContext2D,
    step: TStep,
    cell: SequenceCardCell
  ) => Promise<void>;
  /** Paints the QR into its reserved cell (see `calculateSequenceCardQRCell`). */
  renderQRCode?: (
    ctx: CanvasRenderingContext2D,
    cell: SequenceCardCell
  ) => Promise<void> | void;
  renderMandala?: (
    ctx: CanvasRenderingContext2D,
    steps: TStep[],
    placements: readonly CardMandalaPlacement[],
    layout: SequenceCardLayout
  ) => Promise<void> | void;
  buildHeader: (steps: TStep[], word: string) => SequenceCardHeader;
  renderHeader?: (
    ctx: CanvasRenderingContext2D,
    header: SequenceCardHeader,
    layout: SequenceCardLayout,
    difficultyLevel: number
  ) => Promise<void> | void;
  renderFooter?: (
    ctx: CanvasRenderingContext2D,
    layout: SequenceCardLayout
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
    | "startPlacementLayout"
    | "exportProfile"
    | "frame"
    | "columnCount"
    | "gridCentering"
    | "showLoopGlyph"
  >
): SequenceCardLayout {
  let [columns, rows] =
    options.layout === "strip"
      ? [stepCount, 1]
      : getLayout(stepCount - 1, options.startPlacementLayout);
  if (options.columnCount && options.layout !== "strip") {
    columns = options.columnCount;
    rows =
      options.startPlacementLayout === "row"
        ? 1 + Math.ceil((stepCount - 1) / columns)
        : Math.max(1, Math.ceil((stepCount - 1) / Math.max(1, columns - 1)));
  }
  const frame = options.frame;
  const inset = getCardFrameContentInset(frame?.bleedPx ?? 36);
  const deckCard =
    options.exportProfile === "print"
      ? {
          contentWidth: (frame?.canvasWidth ?? 822) - inset * 2,
          contentHeight: (frame?.canvasHeight ?? 1122) - inset * 2,
        }
      : undefined;
  return {
    ...calculateCardSurface({
      columns,
      rows,
      cellSize: options.cellSize,
      deckCard,
      showHeader:
        options.showWord || options.showDifficulty || !!options.showLoopGlyph,
      showFooter: options.showFooter,
      gridCentering: options.gridCentering,
    }),
    columns,
    rows,
  };
}

export function calculateSequenceCardCell(
  index: number,
  columns: number,
  startPlacementLayout: "row" | "column" = "column",
  layout: "grid" | "strip" = "grid"
): Pick<SequenceCardCell, "index" | "x" | "y"> & { row: number; col: number } {
  if (layout === "strip") return { index, row: 0, col: index, x: index, y: 0 };
  if (index === 0) return { index, row: 0, col: 0, x: 0, y: 0 };

  if (layout === "grid" && startPlacementLayout === "row") {
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

/**
 * The Composer's QR slot: the last cell of the start row, or in column mode
 * the first free cell scanning from the bottom row. One-count cards never
 * carry a QR because the only spare cell would be the start position.
 */
export function calculateSequenceCardQRCell(
  layout: Pick<SequenceCardLayout, "columns" | "rows">,
  options: Pick<SequenceCardCompositionOptions, "layout" | "startPlacementLayout">,
  stepCount: number,
  occupiedCells: ReadonlySet<string>
): { col: number; row: number } | null {
  if (options.layout === "strip" || stepCount <= 1) return null;
  if (options.startPlacementLayout === "row")
    return { col: layout.columns - 1, row: 0 };
  for (let row = layout.rows - 1; row >= 0; row--) {
    for (let col = 0; col < layout.columns; col++) {
      if (!occupiedCells.has(`${col},${row}`)) return { col, row };
    }
  }
  return null;
}

export function calculateSequenceCardMandalaPlacements(
  layout: SequenceCardLayout,
  options: Pick<
    SequenceCardCompositionOptions,
    "layout" | "cellSize" | "showMandala" | "startPlacementLayout"
  >,
  occupiedCells: ReadonlySet<string>,
  /** Steps excluding the start position; short sequences leave info cells empty. */
  stepCount?: number
): CardMandalaPlacement[] {
  if (!options.showMandala || options.layout === "strip") return [];
  if (stepCount !== undefined && stepCount < MANDALA_MIN_STEP_COUNT) return [];

  const candidates: { col: number; row: number }[] = [];
  if (options.startPlacementLayout === "row") {
    for (let col = 1; col < layout.columns; col++) {
      if (!occupiedCells.has(`${col},0`)) candidates.push({ col, row: 0 });
    }
  } else {
    for (let row = 1; row < layout.rows; row++) {
      if (!occupiedCells.has(`0,${row}`)) candidates.push({ col: 0, row });
    }
  }

  const selected = candidates.length <= 2 ? candidates : candidates.slice(0, 3);
  return selected.map((candidate, index) => {
    const variant =
      selected.length === 1
        ? "full"
        : index === 0
          ? "left"
          : index === selected.length - 1
            ? "right"
            : "full";
    return {
      ...candidate,
      x:
        (layout.gridStartX ?? 0) +
        candidate.col * (layout.cellSize ?? options.cellSize),
      y:
        layout.gridStartY +
        candidate.row * (layout.cellSize ?? options.cellSize),
      cellSize: layout.cellSize ?? options.cellSize,
      variant,
    };
  });
}

export async function composeSequenceCard<TStep, TCanvas>(
  pipeline: SequenceCardPipeline<TStep, TCanvas>
): Promise<Buffer> {
  const steps =
    pipeline.options.showReversals && pipeline.applyReversals
      ? pipeline.applyReversals(pipeline.steps)
      : pipeline.steps;
  if (steps.length === 0) throw new Error("No steps to render");

  const layout = calculateSequenceCardLayout(steps.length, pipeline.options);
  const canvas = pipeline.createCanvas(layout.width, layout.height);
  const ctx = pipeline.getContext(canvas);
  const { darkMode, accentColor, accentTintOpacity } = pipeline.options;
  const cellSize = layout.cellSize ?? pipeline.options.cellSize;
  const contentTop = layout.headerHeight;
  const contentHeight = layout.height - layout.headerHeight - layout.footerHeight;
  ctx.fillStyle = darkMode ? "#0a0a0f" : "#ffffff";
  ctx.fillRect(0, contentTop, layout.width, contentHeight);

  // Print cards tint the bands beside the grid with the TnD accent, exactly as
  // the Composer's card-front background does.
  const gridStartX = layout.gridStartX ?? 0;
  if (
    pipeline.options.exportProfile === "print" &&
    !darkMode &&
    accentColor &&
    gridStartX > 0
  ) {
    const gridWidth = layout.columns * cellSize;
    ctx.fillStyle = accentColor + accentAlphaHex(accentTintOpacity);
    ctx.fillRect(0, contentTop, gridStartX, contentHeight);
    ctx.fillRect(
      gridStartX + gridWidth,
      contentTop,
      layout.width - gridStartX - gridWidth,
      contentHeight
    );
  }

  const occupiedCells = new Set<string>();
  const baseOrientation =
    pipeline.calculateDifficultyLevel(steps) === 3 ? "clock" : "in";
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    if (!step) continue;
    const position = calculateSequenceCardCell(
      index,
      layout.columns,
      pipeline.options.startPlacementLayout,
      pipeline.options.layout
    );
    const cell: SequenceCardCell = {
      index,
      stepNumber: pipeline.getStepNumber(step),
      x: (layout.gridStartX ?? 0) + position.x * cellSize,
      y: layout.gridStartY + position.y * cellSize,
      cellSize,
      baseOrientation,
    };
    occupiedCells.add(`${position.col},${position.row}`);
    await pipeline.renderPictograph(ctx, step, cell);
    if (pipeline.options.showStepNumbers) {
      renderStepNumber(
        ctx,
        cell.stepNumber,
        cell.x,
        cell.y,
        cellSize,
        darkMode
      );
    }
    const duration = pipeline.getStepDuration?.(step);
    if (stepHasDurationBadge(duration)) {
      renderDurationBadge(ctx, duration!, cell.x, cell.y, cellSize, darkMode);
    }
  }

  // The QR slot is reserved before mandalas are placed so the two never
  // compete for a cell. Like the Composer, the QR cell draws no smart border.
  const stepCount = steps.length - 1;
  const reservedCells = new Set(occupiedCells);
  if (pipeline.options.showQRCode && pipeline.renderQRCode) {
    const qrCell = calculateSequenceCardQRCell(
      layout,
      pipeline.options,
      stepCount,
      occupiedCells
    );
    if (qrCell) {
      reservedCells.add(`${qrCell.col},${qrCell.row}`);
      await pipeline.renderQRCode(ctx, {
        index: -1,
        stepNumber: -1,
        x: gridStartX + qrCell.col * cellSize,
        y: layout.gridStartY + qrCell.row * cellSize,
        cellSize,
        baseOrientation,
      });
    }
  }

  if (pipeline.renderMandala) {
    const placements = calculateSequenceCardMandalaPlacements(
      layout,
      pipeline.options,
      reservedCells,
      stepCount
    );
    if (placements.length > 0) {
      await pipeline.renderMandala(ctx, steps, placements, layout);
      for (const placement of placements) {
        occupiedCells.add(`${placement.col},${placement.row}`);
      }
    }
  }

  ctx.save();
  ctx.translate(layout.gridStartX ?? 0, 0);
  renderSmartBorders(ctx, {
    columns: layout.columns,
    rows: layout.rows,
    cellSize,
    offsetY: layout.gridStartY,
    occupiedCells,
    darkMode,
  });
  ctx.restore();

  const difficultyLevel = pipeline.calculateDifficultyLevel(steps);
  if (layout.headerHeight > 0 && pipeline.renderHeader) {
    await pipeline.renderHeader(
      ctx,
      pipeline.buildHeader(steps, pipeline.word),
      layout,
      difficultyLevel
    );
  }
  if (
    pipeline.options.showFooter &&
    layout.footerHeight > 0 &&
    pipeline.renderFooter
  ) {
    await pipeline.renderFooter(ctx, layout);
  }
  if (pipeline.options.exportProfile === "print") {
    const frame = pipeline.options.frame ?? {
      accent: "#999999",
      dark: "#444444",
    };
    const framed = pipeline.createCanvas(
      frame.canvasWidth ?? 822,
      frame.canvasHeight ?? 1122
    );
    paintCardFrame(
      pipeline.getContext(framed),
      canvas as unknown as CanvasImageSource,
      frame
    );
    return pipeline.toPng(framed);
  }
  return pipeline.toPng(canvas);
}

/** Two-digit hex alpha for an accent tint; the Composer default is 0x18. */
export function accentAlphaHex(opacity: number | undefined): string {
  return opacity
    ? Math.round(opacity * 255)
        .toString(16)
        .padStart(2, "0")
    : "18";
}
