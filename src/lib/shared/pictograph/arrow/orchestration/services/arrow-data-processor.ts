/**
 * Arrow Data Processor
 *
 * Handles data extraction, validation, and manipulation for arrow positioning.
 * Responsible for working with pictograph data and arrow data structures.
 */

import type { ArrowPlacementData } from "../../positioning/placement/domain/arrow-placement-data";
import type { Point } from "#lib/shared/pictograph/arrow/orchestration/domain/point.js";
import type { MotionData } from "../../../shared/domain/models/motion-data";
import type { PictographData } from "../../../shared/domain/models/pictograph-data";
import { getSceneCenter } from "./arrow-grid-coordinator";

export function getMotionFromPictograph(
  arrowColor: string,
  pictographData: PictographData
): MotionData | undefined {
  if (!pictographData.motions) {
    return undefined;
  }
  return pictographData.motions[
    arrowColor as keyof typeof pictographData.motions
  ];
}

export function ensureValidPosition(initialPosition: Point): Point {
  if (
    initialPosition &&
    typeof initialPosition.x === "number" &&
    typeof initialPosition.y === "number"
  ) {
    return initialPosition;
  }

  console.warn("Invalid initial position, using scene center");
  return getSceneCenter();
}

export function extractAdjustmentValues(
  adjustment: Point | number
): [number, number] {
  if (typeof adjustment === "number") {
    return [adjustment, adjustment];
  }

  if (adjustment && typeof adjustment === "object") {
    const x = typeof adjustment.x === "number" ? adjustment.x : 0;
    const y = typeof adjustment.y === "number" ? adjustment.y : 0;
    return [x, y];
  }

  return [0.0, 0.0];
}

export function updateArrowInPictograph(
  pictographData: PictographData,
  color: string,
  updates: Partial<ArrowPlacementData>,
  motionUpdates?: Partial<MotionData>
): PictographData {
  const updatedPictograph = { ...pictographData };

  const motionKey = color as keyof typeof updatedPictograph.motions;
  const motion = updatedPictograph.motions[motionKey];

  if (motion) {
    updatedPictograph.motions = {
      ...updatedPictograph.motions,
      [motionKey]: {
        ...motion,
        ...motionUpdates,
        arrowPlacementData: {
          ...motion.arrowPlacementData,
          ...updates,
        },
      },
    };
  }

  return updatedPictograph;
}

export function validateArrowData(arrowData: ArrowPlacementData): boolean {
  if (!arrowData) {
    return false;
  }

  const hasValidCoordinates =
    typeof arrowData.positionX === "number" &&
    typeof arrowData.positionY === "number";

  return hasValidCoordinates;
}

export function validateMotionData(motionData: MotionData): boolean {
  if (!motionData) {
    return false;
  }

  const hasMotionType = typeof motionData.motionType === "string";
  const hasStartLocation = motionData.startLocation !== undefined;
  const hasEndLocation = motionData.endLocation !== undefined;

  return hasMotionType && hasStartLocation && hasEndLocation;
}

export function validatePictographData(pictographData: PictographData): boolean {
  if (!pictographData) {
    return false;
  }

  if (!pictographData.motions || typeof pictographData.motions !== "object") {
    return false;
  }

  const motionColors = Object.keys(pictographData.motions);
  if (motionColors.length === 0) {
    return false;
  }

  for (const color of motionColors) {
    const motion =
      pictographData.motions[color as keyof typeof pictographData.motions];
    if (!motion || typeof motion !== "object" || !motion.arrowPlacementData) {
      return false;
    }
  }

  return true;
}

export function extractArrowColors(pictographData: PictographData): string[] {
  if (!pictographData.motions) {
    return [];
  }

  return Object.keys(pictographData.motions);
}

export function getArrowByColor(
  pictographData: PictographData,
  color: string
): ArrowPlacementData | undefined {
  if (!pictographData.motions) {
    return undefined;
  }

  const motion =
    pictographData.motions[color as keyof typeof pictographData.motions];
  return motion?.arrowPlacementData;
}

export function hasMotionData(
  pictographData: PictographData,
  color: string
): boolean {
  if (!pictographData.motions) {
    return false;
  }

  return color in pictographData.motions;
}

export function clonePictographData(
  pictographData: PictographData
): PictographData {
  return JSON.parse(JSON.stringify(pictographData));
}
