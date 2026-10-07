/**
 * Turns Tuple Generator Service
 *
 * Generates turns tuple strings for looking up special placement data. The
 * rules live in @tka/render-core so the app and the MCP card renderers key
 * placements and direction dots the same way.
 */

import { generateTurnsTuple } from "@tka/render-core";
import { isVisibleMotion } from "../../../../shared/domain/models/motion-data";
import type { PictographData } from "../../../../shared/domain/models/pictograph-data";

export class TurnsTupleGenerator {
  /**
   * Generate the turns tuple string for a pictograph.
   *
   * Formats:
   * - TYPE1 Hybrid: "(pro_turns, anti_turns)" or "(blue_turns, red_turns)" if has float
   * - TYPE1 Non-Hybrid: "(blue_turns, red_turns)"
   * - TYPE2: "(shift_turns, static_turns)" or "(direction, shift_turns, static_turns)"
   * - TYPE3: "(direction, shift_turns, dash_turns)"
   * - TYPE4: "(direction, dash_turns, static_turns)" or with prop rotation for Λ
   * - TYPE5: "(direction, blue_turns, red_turns)" or with prop rotation for Λ-
   * - TYPE6: "(direction, blue_turns, red_turns)" or with prop rotation for γ
   */
  generateTurnsTuple(pictographData: PictographData): string {
    const { left, right } = pictographData.motions;
    // Invisible placeholder = hand not really there (both-required Step
    // shape): keep the "(0, 0)" fallback the old absent-hand path produced
    // (the tuple keys glyph caches + special-placement lookups).
    if (!isVisibleMotion(left) || !isVisibleMotion(right)) return "(0, 0)";
    return generateTurnsTuple(pictographData.letter, left, right);
  }
}

// DIRECT EXPORT - Use this instead of turnsTupleGenerator
// This avoids DI container rebuilds when this file changes
export const turnsTupleGenerator = new TurnsTupleGenerator();
