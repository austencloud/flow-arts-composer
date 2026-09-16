/**
 * Sequence Data Provider Interface
 *
 * Platform-agnostic interface for accessing letter and motion data.
 * Implementations differ between Node.js (MCP) and browser contexts.
 */

import type { LetterMappingsJson } from "../types/sequence-engine-types.js";

/**
 * Interface for loading sequence-related data.
 * Allows the sequence engine to work in both Node.js and browser contexts.
 */
export interface ISequenceDataProvider {
  /**
   * Contains placement transitions and categories for all letters.
   */
  loadLetterMappings(): Promise<LetterMappingsJson>;

  /**
   * Load pictograph variations for a specific letter.
   * @param letter - The letter to load variations for (e.g., "D", "Σ")
   * @returns Array of variation data objects
   */
  loadLetterVariations(letter: string): Promise<LetterVariationData[]>;

  isInitialized(): boolean;
}

/**
 * Data for a single letter variation (one row in the CSV).
 */
export interface LetterVariationData {
  /** The letter */
  letter: string;
  /** Start placement (e.g., "alpha1", "beta3") */
  startPlacement: string;
  /** End placement */
  endPlacement: string;
  /** Left motion type */
  leftMotionType: string;
  /** Left start location */
  leftStartLocation: string;
  /** Left end location */
  leftEndLocation: string;
  /** Left rotation direction */
  leftRotationDirection: string;
  /** Right motion type */
  rightMotionType: string;
  /** Right start location */
  rightStartLocation: string;
  /** Right end location */
  rightEndLocation: string;
  /** Right rotation direction */
  rightRotationDirection: string;
  /** Grid mode (diamond, box, skewed) */
  gridMode?: string;
}
