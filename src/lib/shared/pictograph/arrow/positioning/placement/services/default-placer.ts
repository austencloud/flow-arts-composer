import type { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
/**
 * Default Placement Service
 *
 * Provides default arrow placement adjustments by loading data from JSON files.
 * Mirrors the exact functionality from desktop DefaultPlacer.
 */

import type { MotionType } from "../../../../shared/domain/enums/pictograph-enums";
import type { SimpleJsonCache } from '#lib/shared/pictograph/shared/services/simple-json-cache.js'
import { ArrowPlacer } from "./arrow-placer";

/**
 * Interface for Default Placement Service that mirrors Python implementation
 */
export interface IDefaultPlacerJson {
  getDefaultAdjustment(
    placementKey: string,
    turns: number | string,
    motionType: MotionType,
    gridMode: GridMode,
    propType: string
  ): Promise<{ x: number; y: number }>;

  getAvailablePlacementKeys(
    motionType: MotionType,
    gridMode: GridMode
  ): Promise<string[]>;

  isLoaded(): boolean;

  getPlacementData(
    motionType: MotionType,
    placementKey: string,
    gridMode: GridMode
  ): Promise<{ [turns: string]: [number, number] }>;

  debugAvailableKeys(motionType: MotionType, gridMode: GridMode): Promise<void>;
}

export class DefaultPlacer {
  private placementDataService: ArrowPlacer;

  /**
   * Create DefaultPlacer with optional injectable JSON cache
   * @param jsonCacheImpl JSON cache implementation (defaults to browser fetch-based cache)
   */
  constructor(jsonCacheImpl?: SimpleJsonCache) {
    this.placementDataService = new ArrowPlacer(jsonCacheImpl);
  }

  /**
   * Get default adjustment for arrow placement using placement key and turns.
   * This mirrors the Python get_default_adjustment() method.
   *
   * @param placementKey - The placement identifier
   * @param turns - Number of turns or turn identifier
   * @param motionType - Motion type (pro, anti, float, dash, static)
   * @param gridMode - Grid mode (diamond, box)
   * @returns Adjustment coordinates {x, y}
   */
  async getDefaultAdjustment(
    placementKey: string,
    turns: number | string,
    motionType: MotionType,
    gridMode: GridMode,
    propType: string = "staff"
  ): Promise<{ x: number; y: number }> {
    try {
      // Lazy load only the grid mode + prop we need
      await this.placementDataService.ensureLoaded(gridMode, propType);

      const adjustment = await this.placementDataService.getDefaultAdjustment(
        motionType,
        placementKey,
        turns,
        gridMode,
        propType
      );

      return adjustment;
    } catch (error) {
      console.warn(
        `Failed to get default adjustment for ${placementKey} at ${turns} turns:`,
        error
      );
      return { x: 0, y: 0 };
    }
  }

  /**
   * Get available placement keys for a given motion type and grid mode.
   * This mirrors the Python get_available_placement_keys() method.
   *
   * @param motionType - Motion type (pro, anti, float, dash, static)
   * @param gridMode - Grid mode (diamond, box)
   * @returns Array of available placement key strings
   */
  async getAvailablePlacementKeys(
    motionType: MotionType,
    gridMode: GridMode
  ): Promise<string[]> {
    // Lazy load only the grid mode we need
    await this.placementDataService.ensureGridModeLoaded(gridMode);
    return this.placementDataService.getAvailablePlacementKeys(
      motionType,
      gridMode
    );
  }

  /**
   * Check if placement data has been loaded.
   * This mirrors the Python is_loaded() method.
   *
   * @returns true if data is loaded, false otherwise
   */
  isLoaded(): boolean {
    return this.placementDataService.isLoaded();
  }

  // NOTE: _loadAllDefaultPlacements() was removed as dead code.
  // All public methods now use ensureGridModeLoaded() for lazy loading.

  /**
   * Get raw placement data for debugging purposes.
   * This mirrors the Python get_placement_data() method.
   *
   * @param motionType - Motion type (pro, anti, float, dash, static)
   * @param placementKey - The placement identifier
   * @param gridMode - Grid mode (diamond, box)
   * @returns Raw placement data mapping turns to [x, y] adjustments
   */
  async getPlacementData(
    motionType: MotionType,
    placementKey: string,
    gridMode: GridMode
  ): Promise<{ [turns: string]: [number, number] }> {
    // Lazy load only the grid mode we need
    await this.placementDataService.ensureGridModeLoaded(gridMode);
    return this.placementDataService.getPlacementData(
      motionType,
      placementKey,
      gridMode
    );
  }

  /**
   * Debug method to log available placement keys.
   * This mirrors the Python debug_available_keys() method.
   *
   * @param motionType - Motion type to debug
   * @param gridMode - Grid mode to debug
   */
  async debugAvailableKeys(
    motionType: MotionType,
    gridMode: GridMode
  ): Promise<void> {
    // Lazy load only the grid mode we need
    await this.placementDataService.ensureGridModeLoaded(gridMode);
    await this.placementDataService.debugAvailableKeys(motionType, gridMode);
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
// Use this instead of defaultPlacer to avoid DI container rebuilds.
// ============================================================================

export const defaultPlacer = new DefaultPlacer();
