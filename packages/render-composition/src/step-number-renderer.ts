import {
  STEP_NUMBER_FONT_RATIO,
  STEP_LABEL_FONT_RATIO,
  STEP_NUMBER_OFFSET_RATIO,
} from "./dimensions.js";

export function renderStepNumber(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  stepNumber: number,
  cellX: number,
  cellY: number,
  cellSize: number,
  darkMode: boolean
): void {
  if (stepNumber === null || stepNumber === undefined || stepNumber === -1)
    return;

  const isLabel = stepNumber === 0 || stepNumber === -2;
  const fontSize =
    cellSize * (isLabel ? STEP_LABEL_FONT_RATIO : STEP_NUMBER_FONT_RATIO);
  const text =
    stepNumber === 0
      ? "Start"
      : stepNumber === -2
        ? "End"
        : stepNumber.toString();
  const offset = cellSize * STEP_NUMBER_OFFSET_RATIO;

  ctx.save();
  ctx.font = `bold ${fontSize}px Gelasio, Georgia, serif`;
  ctx.fillStyle = darkMode ? "#ffffff" : "#231f20";
  ctx.textAlign = "start";
  ctx.textBaseline = "hanging";
  ctx.fillText(text, cellX + offset, cellY + offset);
  ctx.restore();
}
