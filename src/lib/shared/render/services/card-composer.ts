import type { SequenceData } from "../../foundation/domain/models/sequence-data";
import type { Step } from "@tka/tka-types";
import type { SequenceExportOptions } from "../domain/models/sequence-export-options";
import type { CompositionProgressCallback, RenderCanvas } from "./types";
import { createRenderCanvas } from "./create-render-canvas";
import { calculateLayout } from "./layout-calculator";
import {
  calculateHeaderHeight as sharedHeaderHeight,
  calculateFooterHeight as sharedFooterHeight,
} from "@tka/render-composition";

export async function composeCardImage(
  sequence: SequenceData,
  options: Partial<SequenceExportOptions>,
  composeSequenceImage: (
    sequence: SequenceData,
    options: Partial<SequenceExportOptions>,
    onProgress?: CompositionProgressCallback,
    signal?: AbortSignal
  ) => Promise<RenderCanvas>,
  onProgress?: CompositionProgressCallback,
  signal?: AbortSignal
): Promise<RenderCanvas> {
  const tightCanvas = await composeSequenceImage(
    sequence,
    options,
    onProgress,
    signal
  );

  const cardWidth = tightCanvas.width;
  const cardHeight = Math.round(cardWidth * (7 / 5));

  if (tightCanvas.height >= cardHeight) {
    return tightCanvas;
  }

  const cardCanvas = createRenderCanvas(cardWidth, cardHeight);
  const ctx = cardCanvas.getContext("2d") as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error("Failed to get 2D context for card canvas");

  const isDarkMode = options.visibilityOverrides?.darkMode ?? false;
  ctx.fillStyle = isDarkMode ? "#0a0a0f" : "white";
  ctx.fillRect(0, 0, cardWidth, cardHeight);

  const stepCount = sequence.steps?.length ?? 0;
  const layout = calculateLayout(
    stepCount,
    options.includeStartPlacement ?? false,
    options.startPlacementLayout ?? "row"
  );
  const [columns, rows] = layout;
  const baseBeatSize = options.stepSize || 120;
  const stepSize = Math.floor(baseBeatSize * (options.stepScale || 1));

  const earlyLoopType = options.loopType ?? sequence.loopType;
  const earlyShowLoopGlyph = options.showLoopGlyph !== false && !!earlyLoopType;
  const rawWord = (sequence.steps ?? [])
    .map((s: Step) => s.letter ?? "")
    .join("");
  const showHeader =
    (options.addWord && (rawWord || options.customName)) ||
    options.addDifficultyLevel ||
    earlyShowLoopGlyph;
  const headerHeight = showHeader
    ? calculateHeaderHeight(stepCount, stepSize, columns)
    : 0;

  const showNotes = options.showNotes ?? options.addUserInfo;
  const hasFooter = Boolean(
    showNotes || options.leftLabel || options.rightLabel || options.iconPath
  );
  const footerHeight = hasFooter ? calculateFooterHeight(stepSize, columns) : 0;

  const gridHeight = rows * stepSize;

  const availableHeight = cardHeight - headerHeight - footerHeight;

  const topPadding = Math.max(0, (availableHeight - gridHeight) / 2);

  const tightGridEnd = Math.min(
    headerHeight + gridHeight,
    tightCanvas.height
  );
  const tightFooterStart = tightGridEnd;
  const tightFooterEnd = Math.min(
    tightFooterStart + footerHeight,
    tightCanvas.height
  );

  if (headerHeight > 0) {
    ctx.drawImage(
      tightCanvas,
      0, 0, cardWidth, headerHeight,
      0, 0, cardWidth, headerHeight
    );
  }

  const sourceGridHeight = tightGridEnd - headerHeight;
  if (sourceGridHeight > 0) {
    ctx.drawImage(
      tightCanvas,
      0, headerHeight, cardWidth, sourceGridHeight,
      0, headerHeight + topPadding, cardWidth, sourceGridHeight
    );
  }

  const sourceFooterHeight = tightFooterEnd - tightFooterStart;
  if (footerHeight > 0 && sourceFooterHeight > 0) {
    ctx.drawImage(
      tightCanvas,
      0, tightFooterStart, cardWidth, sourceFooterHeight,
      0, cardHeight - footerHeight, cardWidth, footerHeight
    );
  }

  return cardCanvas;
}

function calculateHeaderHeight(stepCount: number, stepSize: number, columns?: number): number {
  if (stepCount === 0) return 0;
  return sharedHeaderHeight(stepSize, columns);
}

function calculateFooterHeight(stepSize: number, columns?: number): number {
  return sharedFooterHeight(stepSize, columns);
}
