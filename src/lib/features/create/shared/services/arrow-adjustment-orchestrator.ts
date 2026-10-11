/**
 * ArrowAdjustmentOrchestrator
 *
 * Orchestrates arrow adjustment operations including coordinate transformation,
 * layer-based storage, cascading lookup, and cache invalidation.
 *
 * Extracted from ArrowAdjustmentPanel.svelte to make business logic testable.
 */

import { Point } from "fabric";
import { calculateAdjustment } from "./keyboard-arrow-adjuster";
import type { ScreenSpaceAdjustmentTransformer } from "#lib/shared/pictograph/arrow/positioning/calculation/services/screen-space-adjustment-transformer.js";
import type { ArrowAdjustmentCalculator } from "#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-adjustment-calculator.js";
import type { ArrowLocationCalculator } from "#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator.js";
import type { TurnsTupleGenerator } from "#lib/shared/pictograph/arrow/positioning/placement/services/turns-tuple-generator.js";
import type { PictographPreparer } from "#lib/shared/pictograph/shared/services/pictograph-preparer.js";
import { GlobalAdjustmentKeyGenerator } from "#lib/shared/pictograph/arrow/positioning/global/services/global-adjustment-key-generator.js";
import { getGlobalAdjustmentRepository } from "#lib/shared/pictograph/arrow/positioning/global/services/global-adjustment-singleton.js";
import { globalAdjustmentVersion } from "#lib/shared/pictograph/arrow/positioning/global/state/global-adjustment-version.svelte.js";
import type {
  GlobalAdjustmentKey,
  GlobalArrowAdjustmentInput,
} from "#lib/shared/pictograph/arrow/positioning/global/domain/global-arrow-adjustment.js";
import {
  HandSide,
  type HandSide as HandSideValue,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { arrowAdjustmentUndoStack } from "#lib/shared/pictograph/arrow/positioning/global/state/arrow-adjustment-undo-stack.js";
import {
  createCanonicalPlacementContext,
  rotateScreenVectorToCanonical,
} from "#lib/shared/pictograph/arrow/positioning/calculation/services/canonical-placement-frame.js";

/**
 * Arrow selection context for adjustment operations
 */
export interface SelectedArrowContext {
  motionData: MotionData;
  pictographData: PictographData;
  hand: HandSideValue;
}

/**
 * Result of applying a WASD movement
 */
export interface ApplyMovementResult {
  /** The key used for saving (for auto-save scheduling) */
  targetKey: AdjustmentTargetKey;
  /** New X adjustment value */
  newX: number;
  /** New Y adjustment value */
  newY: number;
  /** Whether the operation succeeded */
  success: boolean;
}

/**
 * Target key for adjustment storage
 */
export type AdjustmentTargetKey = GlobalAdjustmentKey;

/**
 * Result of looking up current adjustment via cascading
 */
export interface CascadingLookupResult {
  adjustment: { x: number; y: number };
  layer: 1 | 2 | 3 | null;
}
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";

const logger = createComponentLogger("ArrowAdjustmentOrchestrator");

export class ArrowAdjustmentOrchestrator {
  private keyGenerator: GlobalAdjustmentKeyGenerator;

  /**
   * Override propType on pictographData motions to match the render pipeline.
   * PictographPreparer forces propType from global settings before passing to
   * SpecialPlacer. Without the same override here, resolveEffectiveOriKey produces
   * a different oriKey (e.g. "clock_counter" vs "from_layer2"), causing the saved
   * global adjustment to be invisible to the renderer.
   */
  private overridePictographPropTypes(
    pictographData: PictographData,
    arrowHand: HandSideValue,
    thisPropType: string,
    otherPropType: string
  ): PictographData {
    const otherHand =
      arrowHand === HandSide.LEFT ? HandSide.RIGHT : HandSide.LEFT;
    return {
      ...pictographData,
      motions: {
        ...pictographData.motions,
        [arrowHand]: pictographData.motions[arrowHand]
          ? { ...pictographData.motions[arrowHand], propType: thisPropType }
          : undefined,
        [otherHand]: pictographData.motions[otherHand]
          ? { ...pictographData.motions[otherHand], propType: otherPropType }
          : undefined,
      },
    } as PictographData;
  }

  constructor(
    private screenSpaceTransformer: ScreenSpaceAdjustmentTransformer,
    private arrowAdjustmentCalculator: ArrowAdjustmentCalculator,
    private arrowLocationCalculator: ArrowLocationCalculator,
    private pictographPreparer: PictographPreparer,
    turnsTupleGenerator: TurnsTupleGenerator
  ) {
    this.keyGenerator = new GlobalAdjustmentKeyGenerator(turnsTupleGenerator);
  }

  getDefaultSaveLayer(thisPropType: string, otherPropType: string): 1 | 2 | 3 {
    // Catdogged (different props per hand) → Layer 3 (combo-specific: fan+club)
    // Same prop both hands → Layer 2 (prop-specific: staff, fan, etc.)
    // Adjustments never save at Layer 1 to prevent cross-prop bleed.
    if (thisPropType.toLowerCase() !== otherPropType.toLowerCase()) {
      return 3;
    }
    return 2;
  }

  generateTargetKey(
    selectedArrow: SelectedArrowContext,
    layer: 1 | 2 | 3,
    thisPropType: string,
    otherPropType?: string
  ): AdjustmentTargetKey | null {
    const keyOptions =
      layer === 1
        ? undefined // Layer 1: no prop types
        : layer === 3 && otherPropType
          ? { propType: thisPropType, otherPropType } // Layer 3: both prop types
          : { propType: thisPropType }; // Layer 2: just this prop

    const arrowHand = selectedArrow.hand;
    const pictographWithPropOverrides = this.overridePictographPropTypes(
      selectedArrow.pictographData,
      arrowHand,
      thisPropType,
      otherPropType || thisPropType
    );

    return this.keyGenerator.generateKey(
      selectedArrow.motionData,
      pictographWithPropOverrides,
      arrowHand,
      keyOptions
    );
  }

  getCurrentAdjustment(
    selectedArrow: SelectedArrowContext,
    thisPropType: string,
    otherPropType: string
  ): CascadingLookupResult | null {
    const repo = getGlobalAdjustmentRepository();
    if (!repo) return null;

    const arrowHand = selectedArrow.hand;
    const pictographWithPropOverrides = this.overridePictographPropTypes(
      selectedArrow.pictographData,
      arrowHand,
      thisPropType,
      otherPropType
    );

    // Generate BASE key (layer 1) for cascading lookup
    const baseKey = this.keyGenerator.generateKey(
      selectedArrow.motionData,
      pictographWithPropOverrides,
      arrowHand
    );

    // Use cascading lookup to find adjustment at any layer
    return repo.getAdjustmentCascading(baseKey, thisPropType, otherPropType);
  }

  async applyWASDMovement(
    key: "w" | "a" | "s" | "d",
    increment: number,
    selectedArrow: SelectedArrowContext,
    thisPropType: string,
    otherPropType: string
  ): Promise<ApplyMovementResult> {
    const repo = getGlobalAdjustmentRepository();
    if (!repo) {
      return {
        targetKey: {} as AdjustmentTargetKey,
        newX: 0,
        newY: 0,
        success: false,
      };
    }

    const { motionData, pictographData, hand: arrowHand } = selectedArrow;

    // Calculate WASD direction (screen space - what user wants to see)
    const screenSpaceAdjustment = calculateAdjustment(key, increment);

    // Calculate the arrow location properly
    // The motionData.arrowLocation often defaults to NORTH when not explicitly set,
    // which breaks the transformation for different pictograph variants.
    const arrowLocation = this.arrowLocationCalculator.calculateLocation(
      motionData,
      pictographData
    );

    const placementFrame = createCanonicalPlacementContext(
      pictographData,
      motionData,
      arrowLocation
    );
    const canonicalScreenAdjustment = rotateScreenVectorToCanonical(
      screenSpaceAdjustment,
      placementFrame.rotationDegrees
    );

    // Transform screen-space adjustment to reference value using the INVERSE transformation.
    // This ensures that pressing W (up) on ANY variant moves the arrow UP on that variant's screen.
    const referenceAdjustment =
      this.screenSpaceTransformer.transformToReference(
        new Point(canonicalScreenAdjustment.x, canonicalScreenAdjustment.y),
        placementFrame.motionData,
        placementFrame.location ?? arrowLocation
      );

    // Determine save layer and build target key
    const defaultLayer = this.getDefaultSaveLayer(thisPropType, otherPropType);
    const targetKey = this.generateTargetKey(
      selectedArrow,
      defaultLayer,
      thisPropType,
      otherPropType
    );

    if (!targetKey) {
      return {
        targetKey: {} as AdjustmentTargetKey,
        newX: 0,
        newY: 0,
        success: false,
      };
    }

    // Get current value via cascading lookup or calculator fallback
    const { currentX, currentY } = await this.getCurrentBaseValue(
      targetKey,
      selectedArrow,
      thisPropType,
      otherPropType,
      arrowHand
    );

    // Calculate new total using reference-transformed adjustment
    const newX = currentX + referenceAdjustment.x;
    const newY = currentY + referenceAdjustment.y;

    // Push previous state to undo stack BEFORE saving
    arrowAdjustmentUndoStack.push({
      targetKey: targetKey!,
      previousX: currentX,
      previousY: currentY,
      newX,
      newY,
      timestamp: Date.now(),
    });

    // Save to global repo locally (NOT to Firestore yet)
    try {
      const input: GlobalArrowAdjustmentInput = {
        ...targetKey,
        adjustmentX: newX,
        adjustmentY: newY,
      };
      repo.saveAdjustmentLocal(input);

      // Clear the pictograph preparation cache so ALL pictographs re-calculate
      this.pictographPreparer.clearCache();

      // Increment version to trigger reactive re-renders
      globalAdjustmentVersion.increment();

      return { targetKey, newX, newY, success: true };
    } catch (error) {
      logger.warn("Failed to save local adjustment:", error);
      return { targetKey, newX: 0, newY: 0, success: false };
    }
  }

  resetToDefault(
    selectedArrow: SelectedArrowContext,
    thisPropType: string,
    currentLayer: 1 | 2 | 3,
    otherPropType?: string
  ): AdjustmentTargetKey | null {
    const repo = getGlobalAdjustmentRepository();
    if (!repo) return null;

    const targetKey = this.generateTargetKey(
      selectedArrow,
      currentLayer,
      thisPropType,
      otherPropType
    );
    if (!targetKey) return null;

    try {
      logger.log(`Deleting from Layer ${currentLayer} (${thisPropType})`);

      // Delete from local cache only (not Firestore - caller handles that)
      repo.deleteAdjustmentLocal(targetKey);

      // Clear the pictograph preparation cache
      this.pictographPreparer.clearCache();

      // Increment version to trigger reactive re-renders
      globalAdjustmentVersion.increment();

      return targetKey;
    } catch (error) {
      logger.warn("Failed to delete local adjustment:", error);
      return null;
    }
  }

  /**
   * Get the current base value for an adjustment, checking global repo first,
   * then falling back to cascading lookup or calculator.
   */
  private async getCurrentBaseValue(
    targetKey: AdjustmentTargetKey,
    selectedArrow: SelectedArrowContext,
    thisPropType: string,
    otherPropType: string,
    arrowHand: HandSide
  ): Promise<{ currentX: number; currentY: number }> {
    const repo = getGlobalAdjustmentRepository();
    if (!repo) {
      return { currentX: 0, currentY: 0 };
    }

    // Check global repo at the target layer first
    const currentAdjustmentAtLayer = repo.getAdjustment(targetKey);
    if (currentAdjustmentAtLayer) {
      return {
        currentX: currentAdjustmentAtLayer.x,
        currentY: currentAdjustmentAtLayer.y,
      };
    }

    // No global adjustment at the target layer - try cascading lookup
    // (a less-specific layer might have an adjustment we should build on)
    const { motionData, pictographData } = selectedArrow;
    const pictographWithPropOverrides = this.overridePictographPropTypes(
      pictographData,
      arrowHand,
      thisPropType,
      otherPropType
    );
    const baseKey = this.keyGenerator.generateKey(
      motionData,
      pictographWithPropOverrides,
      arrowHand
    );
    const cascadingResult = repo.getAdjustmentCascading(
      baseKey,
      thisPropType,
      otherPropType
    );

    if (cascadingResult) {
      return {
        currentX: cascadingResult.adjustment.x,
        currentY: cascadingResult.adjustment.y,
      };
    }

    // No global at any layer - use the calculator to get the same base value
    // the rendering pipeline uses. Global adjustments are ABSOLUTE replacements
    // for the entire special placement, not offsets from zero. So we must start
    // from the same base the renderer is currently using.
    //
    // CRITICAL: Override propType on BOTH motionData and pictographData.motions
    // to match what PictographPreparer does during rendering. Without this, the
    // SpecialPlacer inside the calculator uses the raw sequence propType (e.g.,
    // "staff") for its cascading lookup, while the renderer uses the settings
    // propType (e.g., "bigbuugeng"). This mismatch causes the arrow to jump
    // to a wrong position on the first WASD press after a reset.
    try {
      const motionWithPropOverride = {
        ...motionData,
        propType: thisPropType as MotionData["propType"],
      };

      // Also override the other motion's propType in pictographData so the
      // SpecialPlacer reads the same otherPropType the renderer would use.
      const otherHand =
        arrowHand === HandSide.LEFT ? HandSide.RIGHT : HandSide.LEFT;
      const otherMotion = pictographData.motions?.[otherHand];
      const pictographWithPropOverrides = otherMotion
        ? {
            ...pictographData,
            motions: {
              ...pictographData.motions,
              [arrowHand]: motionWithPropOverride,
              [otherHand]: { ...otherMotion, propType: otherPropType },
            },
          }
        : pictographData;

      const baseAdjustment =
        await this.arrowAdjustmentCalculator.getBaseAdjustmentPublic(
          pictographWithPropOverrides,
          motionWithPropOverride,
          pictographData.letter || "",
          arrowHand
        );
      return { currentX: baseAdjustment.x, currentY: baseAdjustment.y };
    } catch (error) {
      logger.warn("Failed to get base adjustment, using (0, 0):", error);
      return { currentX: 0, currentY: 0 };
    }
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
import { screenSpaceAdjustmentTransformer } from "#lib/shared/pictograph/arrow/positioning/calculation/services/screen-space-adjustment-transformer.js";
import { arrowAdjustmentCalculator } from "#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-adjustment-calculator.js";
import { arrowLocationCalculator } from "#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator.js";
import { pictographPreparer } from "#lib/shared/pictograph/shared/services/pictograph-preparer.js";
import { turnsTupleGenerator } from "#lib/shared/pictograph/arrow/positioning/placement/services/turns-tuple-generator.js";

export const arrowAdjustmentOrchestrator = new ArrowAdjustmentOrchestrator(
  screenSpaceAdjustmentTransformer,
  arrowAdjustmentCalculator,
  arrowLocationCalculator,
  pictographPreparer,
  turnsTupleGenerator
);
