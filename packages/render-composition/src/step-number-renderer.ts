import {
  STEP_NUMBER_FONT_RATIO,
  STEP_LABEL_FONT_RATIO,
  STEP_NUMBER_OFFSET_RATIO,
} from "./dimensions.js";

/**
 * The words drawn in the Start (step 0) and End (step -2) corners. The app
 * passes the visitor's language; standalone renderers keep the English.
 * An empty word leaves that corner blank, which shared gallery pictures use
 * so the card can lay the visitor's word on top.
 */
export interface StepLabels {
  start: string;
  end: string;
}

export const ENGLISH_STEP_LABELS: StepLabels = { start: "Start", end: "End" };

/** The corner word for a step number, or undefined when it shows a number. */
export function stepLabelFor(
  stepNumber: number,
  labels: StepLabels | undefined
): string | undefined {
  if (!labels) return undefined;
  if (stepNumber === 0) return labels.start;
  if (stepNumber === -2) return labels.end;
  return undefined;
}

export function renderStepNumber(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  stepNumber: number,
  cellX: number,
  cellY: number,
  cellSize: number,
  darkMode: boolean,
  /** The Start/End word in the visitor's language. Ignored for numbers. */
  label?: string
): void {
  if (stepNumber === null || stepNumber === undefined || stepNumber === -1)
    return;

  const isLabel = stepNumber === 0 || stepNumber === -2;
  const text = isLabel
    ? (label ??
      (stepNumber === 0 ? ENGLISH_STEP_LABELS.start : ENGLISH_STEP_LABELS.end))
    : stepNumber.toString();
  if (!text) return;
  const fontSize =
    cellSize * (isLabel ? STEP_LABEL_FONT_RATIO : STEP_NUMBER_FONT_RATIO);
  const offset = cellSize * STEP_NUMBER_OFFSET_RATIO;

  ctx.save();
  ctx.font = `bold ${fontSize}px Gelasio, Georgia, serif`;
  ctx.fillStyle = darkMode ? "#ffffff" : "#231f20";
  ctx.textAlign = "start";
  ctx.textBaseline = "hanging";
  ctx.fillText(text, cellX + offset, cellY + offset);
  ctx.restore();
}
