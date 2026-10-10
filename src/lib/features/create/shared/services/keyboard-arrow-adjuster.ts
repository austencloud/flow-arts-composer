/**
 * Keyboard Arrow Adjustment Service
 *
 * Handles manual arrow position adjustments via WASD keyboard controls.
 * Applies adjustments to step data and triggers pictograph updates.
 *
 * Manual adjustments are stored and applied in SCREEN-SPACE:
 * - W = up on screen (0, -increment)
 * - A = left on screen (-increment, 0)
 * - S = down on screen (0, +increment)
 * - D = right on screen (+increment, 0)
 *
 * The adjustments are NOT transformed because the user expects screen-space
 * movement to match their input directly. The global adjustment system uses
 * a composite key (motion type, rotation, location, etc.) to apply the same
 * adjustment to all arrows with matching characteristics.
 *
 * Mirrors legacy desktop app functionality from:
 * legacy\src\main_window\main_widget\sequence_workbench\graph_editor\hotkey_graph_adjuster\arrow_movement_manager.py
 */

import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";
import {
  createMotionData,
  type MotionData,
} from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { createArrowPlacementData } from "#lib/shared/pictograph/arrow/positioning/placement/domain/create-arrow-placement-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

const logger = createComponentLogger("KeyboardArrowAdjustment");

/**
 * Calculate adjustment vector based on WASD key
 * Matches legacy logic from arrow_movement_manager.py lines 50-58
 */
export function calculateAdjustment(
  key: "w" | "a" | "s" | "d",
  increment: number
): { x: number; y: number } {
  const directionMap: Record<string, { x: number; y: number }> = {
    w: { x: 0, y: -increment },
    a: { x: -increment, y: 0 },
    s: { x: 0, y: increment },
    d: { x: increment, y: 0 },
  };

  return directionMap[key] || { x: 0, y: 0 };
}

/**
 * Handle WASD movement for the currently selected arrow
 *
 * Legacy flow (lines 24-48 in arrow_movement_manager.py):
 * 1. Calculate adjustment based on key + modifiers
 * 2. Update special placement JSON with the adjustment
 * 3. Reload all pictographs with that letter
 *
 * Modern flow (web app):
 * 1. Calculate screen-space adjustment based on key + increment
 * 2. Store screen-space value directly (no transformation)
 * 3. Return updated step data to trigger re-render
 *
 * Adjustments are stored in screen-space because:
 * - User expects W to always move UP on their screen
 * - The global adjustment key includes motion characteristics (type, rotation, location)
 * - Same adjustments apply to arrows with matching characteristics
 */
export function handleWASDMovement(
  key: "w" | "a" | "s" | "d",
  increment: number,
  selectedArrow: {
    motionData: MotionData;
    hand: HandSide;
    pictographData: PictographData;
  },
  stepData: StepData
): StepData {
  const adjustment = calculateAdjustment(key, increment);

  logger.log(
    `🎯 WASD adjustment: ${key} → (${adjustment.x}, ${adjustment.y})px for ${selectedArrow.hand} arrow`
  );

  const currentMotion = stepData.motions[selectedArrow.hand];
  if (!currentMotion) {
    logger.warn(`No motion data found for ${selectedArrow.hand} arrow`);
    return stepData;
  }

  const currentAdjustX =
    currentMotion.arrowPlacementData.manualAdjustmentX ?? 0;
  const currentAdjustY =
    currentMotion.arrowPlacementData.manualAdjustmentY ?? 0;

  const newAdjustX = currentAdjustX + adjustment.x;
  const newAdjustY = currentAdjustY + adjustment.y;

  logger.log(`  Previous adjustment: (${currentAdjustX}, ${currentAdjustY})`);
  logger.log(`  New total adjustment: (${newAdjustX}, ${newAdjustY})`);

  const updatedArrowPlacementData = createArrowPlacementData({
    ...currentMotion.arrowPlacementData,
    manualAdjustmentX: newAdjustX,
    manualAdjustmentY: newAdjustY,
  });

  const updatedMotion = createMotionData({
    ...currentMotion,
    arrowPlacementData: updatedArrowPlacementData,
  });

  const updatedStepData: StepData = {
    ...stepData,
    motions: {
      ...stepData.motions,
      [selectedArrow.hand]: updatedMotion,
    },
  };

  logger.success(`✅ Applied manual adjustment to ${selectedArrow.hand} arrow`);

  return updatedStepData;
}
