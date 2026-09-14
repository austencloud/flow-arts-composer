/**
 * App-facing layout utilities backed by the shared card-rendering tables.
 * Composer and MCP exports must never maintain separate layout data.
 */

import { BASE_STEP_SIZE, getLayout } from "@tka/render-composition";

export function validateLayout(
  stepCount: number,
  includeStartPosition: boolean
): boolean {
  if (stepCount < 0) return false;
  if (stepCount > 1000) return false;
  if (typeof includeStartPosition !== "boolean") return false;
  return true;
}

export function calculateLayout(
  stepCount: number,
  includeStartPosition: boolean,
  startPositionLayout: "row" | "column" = "row"
): [number, number] {
  if (!validateLayout(stepCount, includeStartPosition)) {
    throw new Error(
      `Invalid layout parameters: stepCount=${stepCount}, includeStartPosition=${includeStartPosition}`
    );
  }

  return getLayout(
    stepCount,
    includeStartPosition ? startPositionLayout : "none"
  );
}

export function calculateImageDimensions(
  layout: [number, number],
  additionalHeight: number,
  stepScale: number = 1,
  stepSize?: number
): [number, number] {
  const [columns, rows] = layout;
  const actualBeatSize = stepSize ?? BASE_STEP_SIZE * stepScale;

  return [
    Math.floor(columns * actualBeatSize),
    Math.floor(rows * actualBeatSize + additionalHeight),
  ];
}

export function getCurrentStepGridLayout(stepCount: number): [number, number] {
  return calculateLayout(stepCount, false);
}

export function getBaseBeatSize(): number {
  return BASE_STEP_SIZE;
}

export function calculateImageArea(
  stepCount: number,
  includeStartPosition: boolean,
  additionalHeight: number,
  stepScale: number = 1
): number {
  const layout = calculateLayout(stepCount, includeStartPosition);
  const [width, height] = calculateImageDimensions(
    layout,
    additionalHeight,
    stepScale
  );
  return width * height;
}

export function getLayoutEfficiency(
  stepCount: number,
  includeStartPosition: boolean
): number {
  if (stepCount === 0) return 1.0;

  const [columns, rows] = calculateLayout(stepCount, includeStartPosition);
  const totalCells = columns * rows;
  const usedCells = includeStartPosition ? stepCount + 1 : stepCount;

  return usedCells / totalCells;
}

export function getLayoutsInRange(
  minSteps: number,
  maxSteps: number,
  includeStartPosition: boolean
): Array<{
  stepCount: number;
  layout: [number, number];
  efficiency: number;
}> {
  const results = [];

  for (let stepCount = minSteps; stepCount <= maxSteps; stepCount++) {
    if (validateLayout(stepCount, includeStartPosition)) {
      const layout = calculateLayout(stepCount, includeStartPosition);
      const efficiency = getLayoutEfficiency(stepCount, includeStartPosition);
      results.push({ stepCount, layout, efficiency });
    }
  }

  return results;
}

export function calculateGalleryAspectRatio(
  stepCount: number,
  startPositionLayout: "row" | "column" = "row"
): number {
  const [columns, rows] = calculateLayout(stepCount, true, startPositionLayout);
  const additionalHeightFraction = 10 / 21;
  return columns / (rows + additionalHeightFraction);
}

export function calculateThumbnailAspectRatio(
  stepCount: number,
  options: {
    includeStartPosition?: boolean;
    hasHeader?: boolean;
    hasFooter?: boolean;
  } = {}
): number {
  const {
    includeStartPosition = true,
    hasHeader = true,
    hasFooter = true,
  } = options;

  const [columns, rows] = calculateLayout(
    stepCount,
    includeStartPosition,
    "column"
  );

  let additionalHeightFraction = 0;
  if (hasHeader) additionalHeightFraction += 1 / 3;
  if (hasFooter) additionalHeightFraction += 1 / 7;

  return columns / (rows + additionalHeightFraction);
}
