/**
 * Special Placer for Modern Arrow Positioning
 *
 * Orchestrates special placement logic by coordinating specialized services.
 * Provides pixel-perfect special placement adjustments for specific pictograph configurations.
 *
 * ORCHESTRATES SPECIAL PLACEMENT PIPELINE:
 * 1. Check global adjustments (Firestore-backed, admin-set overrides) - NEW
 * 2. Data loading (SpecialPlacementDataProvider)
 * 3. Orientation key generation (SpecialPlacementOriKeyGenerator)
 * 4. Turns tuple generation (TurnsTupleGenerator)
 * 5. Placement lookup with fallback strategies (SpecialPlacementLookup)
 *
 * Direct TypeScript mirror of reference/modern/application/services/positioning/arrows/placement/special_placement_service.py
 */

import { Point as FabricPoint } from "fabric";
import { normalizeLegacyHandSide } from "@tka/tka-types";
import { deriveGridMode as _deriveGridMode } from "../../../../grid/services/grid-mode-deriver";
import { GridMode } from "../../../../grid/domain/enums/grid-enums";
import { placementFrameForGridMode } from "../domain/placement-frame";
import { placementAssetRoot } from "../domain/placement-frame";
import { getStoredRotationOverride } from "./rotation-override-store";
import type { PictographData } from "../../../../shared/domain/models/pictograph-data";
import type { MotionData } from "../../../../shared/domain/models/motion-data";
import { HandSide } from "../../../../shared/domain/enums/pictograph-enums";
import {
  generateOrientationKey,
  getMotionOrientationBucket,
  resolveEffectiveOriKey,
  mapToLegacyBucket,
} from "../../key-generation/services/special-placement-ori-key-generator";
import type { SpecialPlacementDataProvider } from "./special-placement-data-provider";
import type { TurnsTupleGenerator } from "./turns-tuple-generator";
import type { SpecialPlacementLookup } from "./special-placement-lookup";
import { isGlobalReadDisabled } from "../../global/services/global-adjustment-singleton";
import { getGlobalAdjustmentResolver } from "./override-resolvers";

export class SpecialPlacer {
  constructor(
    private readonly dataService: SpecialPlacementDataProvider,
    private readonly tupleGenerator: TurnsTupleGenerator,
    private readonly lookupService: SpecialPlacementLookup
  ) {}

  /**
   * Get special adjustment for arrow based on special placement logic.
   *
   * Orchestrates the pipeline:
   * 0. Check global adjustments (Firestore-backed, admin-set overrides)
   * 1. Generate orientation key
   * 2. Determine grid mode
   * 3. Generate turns tuple
   * 4. Load letter data
   * 5. Lookup adjustment with fallback strategies
   *
   * @param motionData Motion data containing motion information
   * @param pictographData Pictograph data containing letter and context
   * @param arrowColor Color of the arrow ('red' or 'blue')
   * @param attributeKey Optional attribute key for precise lookup
   * @returns Point with special adjustment or null if no special placement found
   */
  async getSpecialAdjustment(
    motionData: MotionData,
    pictographData: PictographData,
    arrowColor?: HandSide,
    attributeKey?: string
  ): Promise<FabricPoint | null> {
    if (!motionData || !pictographData.letter) {
      return null;
    }

    const letter = pictographData.letter;

    // Step 1: Generate orientation key.
    // For staff+staff, collapse to legacy bucket - radial variants are identical.
    const rawOriKey = generateOrientationKey(motionData, pictographData);
    const oriKey = resolveEffectiveOriKey(rawOriKey, pictographData);

    // Step 2: Determine grid mode
    const gridMode = this.getGridMode(pictographData);

    // Step 3: Generate turns tuple
    const turnsTuple = this.tupleGenerator.generateTurnsTuple(pictographData);

    // Determine the arrow key for global adjustment lookup
    const arrowKey = arrowColor || motionData.hand || "left";

    // Get prop types for cascading lookup
    const thisPropType = motionData.propType?.toLowerCase() || "staff";
    const otherColor = arrowKey === "left" ? "right" : "left";
    const otherMotion = pictographData.motions?.[otherColor];
    const otherPropType = otherMotion?.propType?.toLowerCase() || "staff";

    // Step 0 (NEW): Check global adjustments first (Firestore-backed overrides)
    // Uses cascading lookup: Layer 3 (combination) → Layer 2 (prop-specific) → Layer 1 (base)
    // Within each layer, tries specific oriKey first, then legacy bucket fallback
    // CRITICAL: Compute legacy bucket from rawOriKey, not oriKey. For staff+staff,
    // oriKey is already "from_layer1" - mapToLegacyBucket would parse the underscores
    // as orientation separators, producing "from_layer2" (wrong layer entirely).
    const legacyOriKey = mapToLegacyBucket(rawOriKey);
    const globalResolver = getGlobalAdjustmentResolver();
    if (!isGlobalReadDisabled() && globalResolver) {
      const baseKey = {
        placementFrame: placementFrameForGridMode(gridMode),
        oriKey,
        letter,
        turnsTuple,
        arrowKey,
      };
      const cascadingResult = globalResolver(
        baseKey,
        thisPropType,
        otherPropType,
        legacyOriKey
      );

      if (cascadingResult) {
        return new FabricPoint(
          cascadingResult.adjustment.x,
          cascadingResult.adjustment.y
        );
      }
    }

    // Step 4: Load letter data from static JSON
    // Try specific oriKey folder first, fall back to legacy bucket folder
    let letterData = await this.dataService.getLetterData(
      gridMode,
      oriKey,
      letter
    );
    if (!letterData || Object.keys(letterData).length === 0) {
      letterData = await this.dataService.getLetterData(
        gridMode,
        legacyOriKey,
        letter
      );
    }

    if (!letterData || Object.keys(letterData).length === 0) {
      return null;
    }

    // Step 5: Lookup adjustment with fallback strategies
    return this.lookupService.lookupAdjustment(
      letterData,
      turnsTuple,
      motionData,
      pictographData,
      arrowColor,
      attributeKey
    );
  }

  /**
   * Check if rotation angle override exists for this motion.
   *
   * Orchestrates the pipeline for rotation override checking:
   * 1. Validate motion type (only DASH/STATIC)
   * 2. Check localStorage for user overrides (priority)
   * 3. Generate orientation key and turns tuple
   * 4. Load letter data
   * 5. Lookup rotation override flag in JSON data
   *
   * @param motionData Motion data containing motion information
   * @param pictographData Pictograph data containing letter and context
   * @param rotationOverrideKey Key generated by RotationAngleOverrideKeyGenerator
   * @returns true if rotation override flag is present in special placement data or localStorage
   */
  async hasRotationAngleOverride(
    motionData: MotionData,
    pictographData: PictographData,
    rotationOverrideKey: string
  ): Promise<boolean> {
    if (!motionData || !pictographData.letter) {
      return false;
    }

    // Only DASH and STATIC motions can have rotation overrides
    const motionType = motionData.motionType.toLowerCase();
    if (motionType !== "dash" && motionType !== "static") {
      return false;
    }

    const letter = pictographData.letter;

    // Step 1: Generate orientation key.
    // For staff+staff, collapse to legacy bucket - radial variants are identical.
    const rawOriKey = generateOrientationKey(motionData, pictographData);
    const oriKey = resolveEffectiveOriKey(rawOriKey, pictographData);
    // Compute legacy bucket from rawOriKey, not oriKey (same fix as getSpecialAdjustment)
    const legacyOriKey = mapToLegacyBucket(rawOriKey);

    // Step 2: Determine grid mode
    const gridMode = this.getGridMode(pictographData);

    // Step 3: Generate turns tuple
    const turnsTuple = this.tupleGenerator.generateTurnsTuple(pictographData);

    // Mixed-orientation data is sparse by design. A letter or tuple can be
    // absent from its combination bucket while its rotation flag still lives
    // in the selected motion's base layer (for example Θ- (s, 3, 3), whose
    // blue dash flag is in from_layer2). Preserve the authored precedence:
    // exact orientation, legacy combination, then the motion's base layer.
    const orientationBuckets = Array.from(
      new Set([oriKey, legacyOriKey, getMotionOrientationBucket(motionData)])
    );
    // Authored placement JSON and toggles saved before the 2026-08-31 hand
    // rename spell per-hand flags with the legacy colors (blue = left, red =
    // right). The hand spelling stays first so a newer toggle wins.
    const hand = normalizeLegacyHandSide(motionData.hand);
    const overrideKeys = Array.from(
      new Set(
        [
          rotationOverrideKey,
          `${motionType}_rot_angle_override`,
          motionData.hand
            ? `${motionData.hand.toLowerCase()}_rot_angle_override`
            : "",
          hand
            ? `${hand === HandSide.LEFT ? "blue" : "red"}_rot_angle_override`
            : "",
        ].filter(Boolean)
      )
    );

    // Step 4: Check localStorage first. Explicit false values suppress an
    // authored JSON flag, which lets the adjustment button turn defaults off.
    for (const bucket of orientationBuckets) {
      for (const key of overrideKeys) {
        const localStorageOverride = this.checkLocalStorageOverride(
          placementFrameForGridMode(gridMode),
          bucket,
          letter,
          turnsTuple,
          key
        );
        if (localStorageOverride !== null) {
          return localStorageOverride;
        }
      }
    }

    // Step 5: Look through the same buckets and accepted legacy key shapes in
    // static JSON. Continue after a non-empty file when the tuple/key is absent;
    // the base layer remains a valid inherited source.
    for (const bucket of orientationBuckets) {
      const letterData = await this.dataService.getLetterData(
        gridMode,
        bucket,
        letter
      );
      if (!letterData || Object.keys(letterData).length === 0) continue;

      for (const key of overrideKeys) {
        if (
          this.lookupService.lookupRotationOverride(
            letterData,
            turnsTuple,
            key,
            letter
          )
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get the special adjustment from static JSON only, skipping all global Firestore overrides.
   *
   * Used by diagnostics to show what the static JSON file contains independently of any
   * admin-set global overrides. Runs the same oriKey/gridMode/turnsTuple pipeline as
   * getSpecialAdjustment but stops before the global adjustment repository check.
   *
   * @param motionData Motion data containing motion information
   * @param pictographData Pictograph data containing letter and context
   * @param arrowColor Color of the arrow ('red' or 'blue')
   * @param attributeKey Optional attribute key for precise lookup
   * @returns The raw JSON adjustment plus the file path and turns tuple key, or null if not found
   */
  async getSpecialJsonAdjustmentOnly(
    motionData: MotionData,
    pictographData: PictographData,
    arrowColor?: HandSide,
    attributeKey?: string
  ): Promise<{
    adjustment: FabricPoint;
    filePath: string;
    turnsTupleKey: string;
  } | null> {
    if (!motionData || !pictographData.letter) {
      return null;
    }

    const letter = pictographData.letter;

    // Generate orientation key.
    // For staff+staff, collapse to legacy bucket - radial variants are identical.
    const rawOriKey = generateOrientationKey(motionData, pictographData);
    const oriKey = resolveEffectiveOriKey(rawOriKey, pictographData);
    // Compute legacy bucket from rawOriKey, not oriKey (same fix as getSpecialAdjustment)
    const legacyOriKey = mapToLegacyBucket(rawOriKey);

    // Determine grid mode
    const gridMode = this.getGridMode(pictographData);

    // Generate turns tuple
    const turnsTupleKey =
      this.tupleGenerator.generateTurnsTuple(pictographData);

    // Load letter data from static JSON - try specific oriKey, fall back to legacy
    let usedOriKey = oriKey;
    let letterData = await this.dataService.getLetterData(
      gridMode,
      oriKey,
      letter
    );
    if (!letterData || Object.keys(letterData).length === 0) {
      letterData = await this.dataService.getLetterData(
        gridMode,
        legacyOriKey,
        letter
      );
      usedOriKey = legacyOriKey;
    }

    if (!letterData || Object.keys(letterData).length === 0) {
      return null;
    }

    // Look up adjustment from static JSON via the lookup service
    const adjustment = this.lookupService.lookupAdjustment(
      letterData,
      turnsTupleKey,
      motionData,
      pictographData,
      arrowColor,
      attributeKey
    );

    if (!adjustment) {
      return null;
    }

    const filePath = `${placementAssetRoot(
      placementFrameForGridMode(gridMode)
    )}/special/${usedOriKey}/${letter}_placements.json`;

    return { adjustment, filePath, turnsTupleKey };
  }

  /**
   * Check localStorage for rotation override
   * Returns null if not found, true/false if found
   */
  private checkLocalStorageOverride(
    placementFrame: "canonical" | "skewed",
    oriKey: string,
    letter: string,
    turnsTuple: string,
    rotationOverrideKey: string
  ): boolean | null {
    return getStoredRotationOverride(
      placementFrame,
      oriKey,
      letter,
      turnsTuple,
      rotationOverrideKey
    );
  }

  /**
   * Get grid mode from pictograph data
   */
  private getGridMode(pictographData: PictographData): string {
    if (pictographData.motions.left && pictographData.motions.right) {
      return _deriveGridMode(
        pictographData.motions.left,
        pictographData.motions.right
      );
    }
    return GridMode.DIAMOND;
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
// Use this instead of specialPlacer to avoid DI container rebuilds.
// ============================================================================

import { specialPlacementDataProvider } from "./special-placement-data-provider";
import { turnsTupleGenerator } from "./turns-tuple-generator";
import { specialPlacementLookup } from "./special-placement-lookup";

export const specialPlacer = new SpecialPlacer(
  specialPlacementDataProvider,
  turnsTupleGenerator,
  specialPlacementLookup
);
