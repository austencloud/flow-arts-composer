/**
 * Domain models for section-based LOOP designations
 */

import type { ComponentId } from "../constants/loop-components";
import type { Period } from "#lib/shared/foundation/domain/models/generation/circular-models.js";

export interface SectionDesignation {
  steps: number[]; // Beat numbers in this section
  components: ComponentId[];
  loopType: string | null;
  period?: Period | null; // Only relevant when "rotated" component is selected
  baseWord?: string; // TKA base word this section derives from (e.g., "bbbb", "ekek")
  baseWordFragment?: string; // Fragment of base word if only partial (e.g., "BB" from "BBBB")
  transformation?: string; // How this instance is transformed: "none", "mirrored", "rotated", etc.
}
