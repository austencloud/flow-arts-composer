/**
 * Global Arrow Adjustment Domain Model
 *
 * Represents a user-defined arrow position adjustment that applies globally
 * to all pictographs matching the same key.
 *
 * Key Structure (3 layers for cascading lookups):
 * - Layer 1 (Base): placementFrame|oriKey|letter|turnsTuple|arrowKey
 *   - Staff adjustments; serve as fallback for all props
 * - Layer 2 (Prop-Specific): placementFrame|oriKey|letter|turnsTuple|arrowKey|propType
 *   - Adjustments for specific prop types (fan, club, buugeng, etc.)
 * - Layer 3 (Combination Override): placementFrame|oriKey|letter|turnsTuple|arrowKey|propType|otherPropType
 *   - Edge cases where blue+red prop combo causes conflicts
 *
 * These adjustments are stored in Firestore and override the static JSON special placements.
 */

import type { Timestamp } from "firebase/firestore";
import {
  normalizePlacementFrame,
  type PlacementFrame,
} from "../../placement/domain/placement-frame";

/**
 * A single global arrow adjustment entry
 */
export interface GlobalArrowAdjustment {
  /** Authored ownership frame. Diamond and Box both resolve to canonical. */
  readonly placementFrame: PlacementFrame;

  /** Orientation key: "from_layer1", "from_layer2", etc. */
  readonly oriKey: string;

  /** Letter identifier: "A", "G", "W", "Λ", etc. */
  readonly letter: string;

  /** Turns tuple: "(2, 0.5)", "(s, 1, 1)", etc. */
  readonly turnsTuple: string;

  /**
   * Arrow identifier: "left" or "right". Records saved before the hand
   * rename still say "blue" or "red"; the repository reads them as left and
   * right.
   */
  readonly arrowKey: string;

  /** Prop type for this arrow (Layer 2+). Lowercase: "staff", "fan", "club", etc. */
  readonly propType?: string;

  /** Other hand's prop type (Layer 3 only). For combination-specific overrides. */
  readonly otherPropType?: string;

  /** X-axis adjustment in pixels */
  readonly adjustmentX: number;

  /** Y-axis adjustment in pixels */
  readonly adjustmentY: number;

  /** When this adjustment was last modified */
  readonly updatedAt: Timestamp;

  /** Email of the admin who made the adjustment */
  readonly updatedBy: string;
}

/**
 * Data required to create or update a global adjustment
 */
export interface GlobalArrowAdjustmentInput {
  readonly placementFrame: string;
  readonly oriKey: string;
  readonly letter: string;
  readonly turnsTuple: string;
  readonly arrowKey: string;
  /** Prop type for this arrow (Layer 2+). Lowercase: "staff", "fan", "club", etc. */
  readonly propType?: string;
  /** Other hand's prop type (Layer 3 only). For combination-specific overrides. */
  readonly otherPropType?: string;
  readonly adjustmentX: number;
  readonly adjustmentY: number;
}

/**
 * Composite key for looking up adjustments.
 *
 * Key layers:
 * - Layer 1: 5 parts (base - no prop types)
 * - Layer 2: 6 parts (includes propType)
 * - Layer 3: 7 parts (includes propType + otherPropType)
 */
export interface GlobalAdjustmentKey {
  readonly placementFrame: PlacementFrame;
  readonly oriKey: string;
  readonly letter: string;
  readonly turnsTuple: string;
  readonly arrowKey: string;
  /** Prop type for this arrow (Layer 2+). Lowercase: "staff", "fan", "club", etc. */
  readonly propType?: string;
  /** Other hand's prop type (Layer 3 only). For combination-specific overrides. */
  readonly otherPropType?: string;
}

/**
 * Get the layer (1, 2, or 3) of an adjustment key based on which fields are present.
 */
export function getKeyLayer(key: GlobalAdjustmentKey): 1 | 2 | 3 {
  if (key.otherPropType) return 3;
  if (key.propType) return 2;
  return 1;
}

/**
 * Generate a string key from adjustment key components.
 * Format varies by layer:
 * - Layer 1: placementFrame|oriKey|letter|turnsTuple|arrowKey
 * - Layer 2: placementFrame|oriKey|letter|turnsTuple|arrowKey|propType
 * - Layer 3: placementFrame|oriKey|letter|turnsTuple|arrowKey|propType|otherPropType
 */
export function generateAdjustmentKeyString(key: GlobalAdjustmentKey): string {
  let keyString = `${normalizePlacementFrame(key.placementFrame)}|${key.oriKey}|${key.letter}|${key.turnsTuple}|${key.arrowKey}`;
  if (key.propType) {
    keyString += `|${key.propType}`;
    if (key.otherPropType) {
      keyString += `|${key.otherPropType}`;
    }
  }
  return keyString;
}

/**
 * Parse a string key back into components.
 * Handles 5, 6, or 7 part keys (layers 1, 2, or 3).
 */
export function parseAdjustmentKeyString(
  keyString: string
): GlobalAdjustmentKey | null {
  const parts = keyString.split("|");

  // Must have at least 5 parts (base key), at most 7 (layer 3 key)
  if (parts.length < 5 || parts.length > 7) {
    return null;
  }

  const [
    placementFrameValue,
    oriKey,
    letter,
    turnsTuple,
    arrowKey,
    propType,
    otherPropType,
  ] = parts;

  // Base fields are required
  if (!placementFrameValue || !oriKey || !letter || !turnsTuple || !arrowKey) {
    return null;
  }
  let placementFrame: PlacementFrame;
  try {
    placementFrame = normalizePlacementFrame(placementFrameValue);
  } catch {
    return null;
  }

  const key: GlobalAdjustmentKey = {
    placementFrame,
    oriKey,
    letter,
    turnsTuple,
    arrowKey,
  };

  // Layer 2+: include propType if present
  if (propType) {
    (key as { propType?: string }).propType = propType;
  }

  // Layer 3: include otherPropType if present
  if (otherPropType) {
    (key as { otherPropType?: string }).otherPropType = otherPropType;
  }

  return key;
}
