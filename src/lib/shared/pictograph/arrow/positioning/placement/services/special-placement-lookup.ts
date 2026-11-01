/**
 * Special Placement Lookup
 *
 * Performs lookups in special placement data with fallback strategies.
 * Handles hybrid vs non-hybrid letter lookup logic.
 */

import { Point } from "#lib/shared/pictograph/arrow/orchestration/domain/point.js";
import type { MotionData } from "../../../../shared/domain/models/motion-data";
import type { PictographData } from "../../../../shared/domain/models/pictograph-data";
import {
  isHybridLetter,
  startsFromStandardOrientation,
} from "./letter-classifier";
import { HandSide, normalizeLegacyHandSide } from "@tka/tka-types";

export class SpecialPlacementLookup {
  constructor() {}

  /**
   * Look up special placement adjustment from placement data.
   * Applies fallback strategies based on letter type (hybrid vs non-hybrid).
   */
  lookupAdjustment(
    letterData: Record<string, unknown>,
    turnsTuple: string,
    motionData: MotionData,
    pictographData: PictographData,
    arrowColor?: string,
    attributeKey?: string
  ): Point | null {
    // Handle nested structure like legacy system does
    // For G letter: letterData = { G: { "(0, 0)": { "red": [0, -130] } } }
    const letter = pictographData.letter ?? "";
    const letterSpecificData = letterData[letter];
    const actualLetterData =
      letterSpecificData && typeof letterSpecificData === "object"
        ? (letterSpecificData as Record<string, unknown>)
        : letterData;

    // Get turn-specific data
    const turnData = actualLetterData[turnsTuple] as
      | Record<string, unknown>
      | undefined;

    if (!turnData) {
      return null;
    }

    // Use attribute key if provided (preferred method)
    if (attributeKey && attributeKey in turnData) {
      const adjustmentValues = turnData[attributeKey];
      if (Array.isArray(adjustmentValues) && adjustmentValues.length === 2) {
        return new Point(
          adjustmentValues[0] as number,
          adjustmentValues[1] as number
        );
      }
    }

    // FALLBACK LOGIC (when attributeKey not provided or not found)
    return this.applyFallbackStrategy(
      turnData,
      motionData,
      pictographData,
      arrowColor
    );
  }

  /**
   * Look up rotation angle override flag from placement data.
   */
  lookupRotationOverride(
    letterData: Record<string, unknown>,
    turnsTuple: string,
    rotationOverrideKey: string,
    letter: string
  ): boolean {
    // Handle nested structure - use the actual letter, not first key
    const letterSpecificData = letterData[letter];
    const actualLetterData =
      letterSpecificData && typeof letterSpecificData === "object"
        ? (letterSpecificData as Record<string, unknown>)
        : letterData;

    // Try exact tuple first
    let turnData = actualLetterData[turnsTuple] as
      | Record<string, unknown>
      | undefined;

    // FALLBACK: If not found and tuple has direction prefix, try without it
    // JSON data sometimes omits direction prefix for whole-number turns
    if (!turnData) {
      const fallbackTuple = this.tryAlternativeTupleFormat(turnsTuple);
      if (fallbackTuple && fallbackTuple !== turnsTuple) {
        turnData = actualLetterData[fallbackTuple] as
          | Record<string, unknown>
          | undefined;
      }
    }

    if (!turnData) {
      return false;
    }

    // Check if rotation override flag exists and is true
    const overrideFlag = turnData[rotationOverrideKey];
    return overrideFlag === true;
  }

  /**
   * Try alternative tuple format for legacy JSON compatibility.
   * Desktop JSON files sometimes use different direction prefix rules.
   *
   * IMPORTANT: For TYPE2+ letters (W, X, Y, Z, Σ, Δ, Θ, Ω, etc.), the direction
   * prefix (s/o) is semantically meaningful - it indicates whether motions rotate
   * in the same or opposite direction. We should NOT strip this prefix as a fallback
   * because (s, 0, 1) and (0, 1) represent different configurations.
   *
   * Only strip the direction prefix for simple 2-value tuples where direction
   * might have been omitted in legacy data (e.g., when one motion has 0 turns).
   */
  private tryAlternativeTupleFormat(turnsTuple: string): string | null {
    // Pattern: "(num1, num2)" without direction - try adding direction prefixes
    const withoutDirectionMatch = turnsTuple.match(
      /^\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)$/
    );
    if (withoutDirectionMatch) {
      // Could try with 's' or 'o' prefix, but since we don't know which,
      // just return null - the caller should handle both cases
      return null;
    }

    // DO NOT strip direction prefix from tuples like "(s, 0, 1)" because
    // the direction is meaningful for TYPE2+ letters. The old fallback
    // was causing incorrect override matches.
    return null;
  }

  /**
   * Apply fallback lookup strategies based on letter type
   */
  private applyFallbackStrategy(
    turnData: Record<string, unknown>,
    motionData: MotionData,
    pictographData: PictographData,
    arrowColor?: string
  ): Point | null {
    const isHybridLetterVal = isHybridLetter(pictographData.letter ?? "");
    const standardOrientation = startsFromStandardOrientation(pictographData);

    // For HYBRID letters with standard orientation, use motion type as PRIMARY key
    if (isHybridLetterVal && standardOrientation) {
      const result = this.lookupByMotionType(turnData, motionData);
      if (result) {
        return result;
      }
    } else {
      // For NON-HYBRID letters, try color-based lookup first
      const colorResult = this.lookupByColor(
        turnData,
        motionData,
        pictographData,
        arrowColor
      );
      if (colorResult) {
        return colorResult;
      }

      // Fallback: try motion-type-specific adjustment for NON-HYBRID letters
      const motionTypeResult = this.lookupByMotionType(turnData, motionData);
      if (motionTypeResult) {
        return motionTypeResult;
      }
    }

    return null;
  }

  /**
   * Look up adjustment by motion type key
   */
  private lookupByMotionType(
    turnData: Record<string, unknown>,
    motionData: MotionData
  ): Point | null {
    const motionTypeKey = motionData.motionType.toLowerCase();

    if (motionTypeKey in turnData) {
      const adjustmentValues = turnData[motionTypeKey];
      if (Array.isArray(adjustmentValues) && adjustmentValues.length === 2) {
        return new Point(
          adjustmentValues[0] as number,
          adjustmentValues[1] as number
        );
      }
    }

    return null;
  }

  /**
   * Look up adjustment by arrow color
   */
  private lookupByColor(
    turnData: Record<string, unknown>,
    motionData: MotionData,
    pictographData: PictographData,
    arrowColor?: string
  ): Point | null {
    const hand =
      normalizeLegacyHandSide(arrowColor ?? motionData.hand) ??
      (pictographData.motions.right === motionData
        ? HandSide.RIGHT
        : HandSide.LEFT);
    let colorKey = hand === HandSide.LEFT ? "blue" : "red";

    if (pictographData.betaSwapped) {
      colorKey = colorKey === "blue" ? "red" : "blue";
    }

    if (colorKey in turnData) {
      const adjustmentValues = turnData[colorKey];
      if (Array.isArray(adjustmentValues) && adjustmentValues.length === 2) {
        return new Point(
          adjustmentValues[0] as number,
          adjustmentValues[1] as number
        );
      }
    }

    return null;
  }
}

// Use this instead of specialPlacementLookup to avoid DI container rebuilds.

export const specialPlacementLookup = new SpecialPlacementLookup();
