/**
 * Tool Output Filtering (Tier 1)
 *
 * The core insight: the LLM can't dump what it doesn't receive.
 *
 * This module strips contextData and other internal fields from tool outputs
 * before the LLM sees them. This is the most effective defense against
 * data dumping because it prevents the problem at the source.
 */

import type { DisplayOutput } from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// Fields to Strip
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fields that should NEVER be passed to the LLM.
 * These contain internal data structures that the LLM tends to dump verbatim.
 */
const INTERNAL_FIELDS = new Set([
  "contextData",
  "startPlacement", // Position numbers like "alpha3"
  "endPlacement",
  "startPosition", // Pre-rename aliases remain filtered at this untrusted boundary.
  "endPosition",
  "letterType", // Raw type number
  "leftMotion", // Full motion object
  "rightMotion",
  "blueMotion", // Legacy aliases remain filtered at this untrusted boundary.
  "redMotion",
  "variationCount",
  "allVariations",
]);

/**
 * Fields to keep in the output (allowlist approach for safety)
 */
const DISPLAY_FIELDS = new Set([
  "explanation",
  "text",
  "inlinePictograph",
  "inlineGallery",
  "inlineGalleries", // Multiple galleries (e.g., diamond + box mode)
  "inlineSequencePlayer",
  "inlineStepGrid",
  "inlineQuiz",
  // Sequence validation results (user-friendly)
  "isValid",
  "word",
  "canBeInterpolated",
  "interpolatedSequence",
  // Term definitions (simple strings)
  "position",
  "definition",
  "gridDescription",
  "motionType",
  "gridMovement",
]);

// ═══════════════════════════════════════════════════════════════════════════
// Output Filter
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Strip internal data from tool output, leaving only display-ready content.
 *
 * @param result - Raw tool execution result
 * @returns Sanitized output safe for LLM consumption
 */
export function toDisplayOutput(result: unknown): DisplayOutput | string {
  // Handle string results (canonical responses, error messages)
  if (typeof result === "string") {
    return result;
  }

  // Handle null/undefined
  if (result == null) {
    return { explanation: "No result available." };
  }

  // Handle non-objects
  if (typeof result !== "object") {
    return { explanation: String(result) };
  }

  const input = result as Record<string, unknown>;
  const output: DisplayOutput = {};

  // Process each field
  for (const [key, value] of Object.entries(input)) {
    // Skip internal fields
    if (INTERNAL_FIELDS.has(key)) {
      continue;
    }

    // Include display fields directly
    if (DISPLAY_FIELDS.has(key)) {
      (output as Record<string, unknown>)[key] = value;
      continue;
    }

    // For unknown fields, check if they contain internal data
    if (typeof value === "object" && value !== null) {
      const nested = value as Record<string, unknown>;
      // Skip if it has internal field patterns
      if (
        "contextData" in nested ||
        "startPlacement" in nested ||
        "startPosition" in nested ||
        "leftMotion" in nested ||
        "rightMotion" in nested ||
        "blueMotion" in nested ||
        "redMotion" in nested
      ) {
        continue;
      }
    }
  }

  // Ensure at least explanation or text exists
  if (!output.explanation && !output.text && Object.keys(output).length === 0) {
    // Try to extract something useful
    if ("explanation" in input && typeof input.explanation === "string") {
      output.explanation = input.explanation;
    } else if (typeof input === "object") {
      // Last resort: stringify without internal fields
      const safeKeys = Object.keys(input).filter(
        (k) => !INTERNAL_FIELDS.has(k)
      );
      if (safeKeys.length > 0) {
        output.explanation = "See the pictograph for details.";
      }
    }
  }

  return output;
}

export function filterToolResults(
  results: unknown[]
): (DisplayOutput | string)[] {
  return results.map(toDisplayOutput);
}

/**
 * Check if a result contains internal data that shouldn't be exposed.
 * Useful for debugging and validation.
 */
export function hasInternalData(result: unknown): boolean {
  if (typeof result !== "object" || result === null) {
    return false;
  }

  const obj = result as Record<string, unknown>;

  for (const field of INTERNAL_FIELDS) {
    if (field in obj) {
      return true;
    }
  }

  // Check nested objects
  for (const value of Object.values(obj)) {
    if (typeof value === "object" && value !== null) {
      if (hasInternalData(value)) {
        return true;
      }
    }
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// Specialized Filters
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Filter for letter explanation results.
 * Keeps only the explanation and inline pictograph.
 */
export function filterLetterExplanation(
  result: unknown
): DisplayOutput | string {
  if (typeof result === "string") {
    return result;
  }

  if (typeof result !== "object" || result === null) {
    return { explanation: "Letter information not available." };
  }

  const input = result as Record<string, unknown>;

  return {
    explanation:
      typeof input.explanation === "string" ? input.explanation : undefined,
    inlinePictograph:
      input.inlinePictograph as DisplayOutput["inlinePictograph"],
  };
}

/**
 * Filter for type list results.
 * Keeps explanation and gallery, strips detailed contextData.
 */
export function filterTypeList(result: unknown): DisplayOutput | string {
  if (typeof result === "string") {
    return result;
  }

  if (typeof result !== "object" || result === null) {
    return { explanation: "Type information not available." };
  }

  const input = result as Record<string, unknown>;

  return {
    explanation:
      typeof input.explanation === "string" ? input.explanation : undefined,
    inlineGallery: input.inlineGallery as DisplayOutput["inlineGallery"],
  };
}

/**
 * Filter for comparison results.
 * Keeps explanation and gallery for side-by-side display.
 */
export function filterComparison(result: unknown): DisplayOutput | string {
  if (typeof result === "string") {
    return result;
  }

  if (typeof result !== "object" || result === null) {
    return { explanation: "Comparison not available." };
  }

  const input = result as Record<string, unknown>;

  return {
    explanation:
      typeof input.explanation === "string" ? input.explanation : undefined,
    inlineGallery: input.inlineGallery as DisplayOutput["inlineGallery"],
  };
}

/**
 * Filter for sequence results.
 * Keeps validation info and player/grid, strips internal step data.
 */
export function filterSequence(result: unknown): DisplayOutput | string {
  if (typeof result === "string") {
    return result;
  }

  if (typeof result !== "object" || result === null) {
    return { explanation: "Sequence not available." };
  }

  const input = result as Record<string, unknown>;

  const output: DisplayOutput = {
    explanation:
      typeof input.explanation === "string" ? input.explanation : undefined,
  };

  // Include sequence player if present
  if (input.inlineSequencePlayer) {
    output.inlineSequencePlayer =
      input.inlineSequencePlayer as DisplayOutput["inlineSequencePlayer"];
  }

  // Include step grid if present, but filter step internals
  if (input.inlineStepGrid) {
    const grid = input.inlineStepGrid as Record<string, unknown>;
    output.inlineStepGrid = {
      type: "inline-step-grid",
      word: grid.word as string,
      steps: (
        grid.steps as Array<{
          stepNumber: number;
          letter: string;
          label?: string;
        }>
      ).map((step) => ({
        stepNumber: step.stepNumber,
        letter: step.letter,
        label: step.label,
        // Exclude variation, startPlacement, endPlacement
      })),
      caption: grid.caption as string | undefined,
    };
  }

  return output;
}

/**
 * Filter for quiz results.
 * Keeps quiz structure for client rendering.
 */
export function filterQuiz(result: unknown): DisplayOutput | string {
  if (typeof result === "string") {
    return result;
  }

  if (typeof result !== "object" || result === null) {
    return { explanation: "Quiz not available." };
  }

  const input = result as Record<string, unknown>;

  return {
    explanation:
      typeof input.explanation === "string" ? input.explanation : undefined,
    inlineQuiz: input.inlineQuiz as DisplayOutput["inlineQuiz"],
  };
}
