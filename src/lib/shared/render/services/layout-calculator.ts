/**
 * App-facing layout utilities backed by the shared card-rendering tables.
 * Composer and MCP exports must never maintain separate layout data.
 */

import { BASE_STEP_SIZE, getLayout } from "@tka/render-composition";

export function validateLayout(
  stepCount: number,
  includeStartPlacement: boolean
): boolean {
  if (stepCount < 0) return false;
  if (stepCount > 1000) return false;
  if (typeof includeStartPlacement !== "boolean") return false;
  return true;
}

export function calculateLayout(
  stepCount: number,
  includeStartPlacement: boolean,
  startPlacementLayout: "row" | "column" = "row"
): [number, number] {
  if (!validateLayout(stepCount, includeStartPlacement)) {
    throw new Error(
      `Invalid layout parameters: stepCount=${stepCount}, includeStartPlacement=${includeStartPlacement}`
    );
  }

  return getLayout(
    stepCount,
    includeStartPlacement ? startPlacementLayout : "none"
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
  includeStartPlacement: boolean,
  additionalHeight: number,
  stepScale: number = 1
): number {
  const layout = calculateLayout(stepCount, includeStartPlacement);
  const [width, height] = calculateImageDimensions(
    layout,
    additionalHeight,
    stepScale
  );
  return width * height;
}

export function getLayoutEfficiency(
  stepCount: number,
  includeStartPlacement: boolean
): number {
  if (stepCount === 0) return 1.0;

  const [columns, rows] = calculateLayout(stepCount, includeStartPlacement);
  const totalCells = columns * rows;
  const usedCells = includeStartPlacement ? stepCount + 1 : stepCount;

  return usedCells / totalCells;
}

export function getLayoutsInRange(
  minSteps: number,
  maxSteps: number,
  includeStartPlacement: boolean
): Array<{
  stepCount: number;
  layout: [number, number];
  efficiency: number;
}> {
  const results = [];

  for (let stepCount = minSteps; stepCount <= maxSteps; stepCount++) {
    if (validateLayout(stepCount, includeStartPlacement)) {
      const layout = calculateLayout(stepCount, includeStartPlacement);
      const efficiency = getLayoutEfficiency(stepCount, includeStartPlacement);
      results.push({ stepCount, layout, efficiency });
    }
  }

  return results;
}

export function calculateGalleryAspectRatio(
  stepCount: number,
  startPlacementLayout: "row" | "column" = "row"
): number {
  const [columns, rows] = calculateLayout(stepCount, true, startPlacementLayout);
  const additionalHeightFraction = 10 / 21;
  return columns / (rows + additionalHeightFraction);
}

export function calculateThumbnailAspectRatio(
  stepCount: number,
  options: {
    includeStartPlacement?: boolean;
    hasHeader?: boolean;
    hasFooter?: boolean;
  } = {}
): number {
  const {
    includeStartPlacement = true,
    hasHeader = true,
    hasFooter = true,
  } = options;

  const [columns, rows] = calculateLayout(
    stepCount,
    includeStartPlacement,
    "column"
  );

  let additionalHeightFraction = 0;
  if (hasHeader) additionalHeightFraction += 1 / 3;
  if (hasFooter) additionalHeightFraction += 1 / 7;

  return columns / (rows + additionalHeightFraction);
}
