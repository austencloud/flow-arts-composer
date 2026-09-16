/**
 * LOOP Explanation Text Generator
 *
 * Generates explanation text for LOOP transformations.
 * Provides detailed, user-friendly descriptions for all LOOP component combinations.
 * Each combination has a unique description explaining exactly what happens to the sequence.
 */

import { LOOPComponent } from "../domain/models/generate-models";

/**
 * Detailed descriptions for individual LOOP components.
 * Reserved orientation primitives (ZONE_HOLD_INVERT / FLIP / CROSS) are
 * intentionally absent - they are never user-surfaced.
 */
const singleDescriptions: Partial<Record<LOOPComponent, string>> = {
  [LOOPComponent.ROTATED]:
    "Rotates the entire sequence 180° around the grid center. North becomes South, East becomes West. The sequence plays out in the opposite quadrants while maintaining the same motion patterns.",
  [LOOPComponent.MIRRORED]:
    "Reflects every hand location across the selected axis. The grid mode stays the same.",
  [LOOPComponent.FLIPPED]:
    "Flips the sequence across the horizontal axis. Top becomes Bottom and vice versa. Creates a vertical reflection of your original movement pattern.",
  [LOOPComponent.SWAPPED]:
    "Exchanges which hand performs each movement. Your left hand does what the right was doing, and the right does what the left was doing. The spatial locations stay the same.",
  [LOOPComponent.INVERTED]:
    "Inverts each motion's rotation relative to its path. Pro becomes anti, and anti becomes pro. Base motion types (static, dash) remain unchanged.",
  [LOOPComponent.REWOUND]:
    "Reverses the sequence direction. The last step becomes the first, playing backward to create a perfect loop back to the start placement.",
};

/**
 * Descriptions for two-component combinations.
 * Key format: sorted alphabetically, joined with underscore.
 */
const twoComponentDescriptions: Record<string, string> = {
  // Mirrored + Inverted
  inverted_mirrored:
    "Reflects the sequence across the selected axis and swaps Pro with Anti. The two direction reversals cancel.",

  // Mirrored + Rotated
  mirrored_rotated:
    "Rotates the sequence 180°, then reflects the completed rotation across the selected axis.",

  // Mirrored + Swapped
  mirrored_swapped:
    "Reflects the sequence across the selected axis and swaps the left and right hand roles.",

  // Rotated + Inverted
  inverted_rotated:
    "Applies 180° rotation and inverts motion types (Pro ↔ Anti).",

  // Rotated + Swapped
  rotated_swapped:
    "Applies 180° rotation and swaps hand roles (left ↔ right). Each hand performs the other's rotated movement.",

  // Swapped + Inverted
  inverted_swapped:
    "Swaps hand roles (left ↔ right) and inverts motion types (Pro ↔ Anti). Each hand performs the other's inverted movement.",
};

/**
 * Descriptions for three-component combinations.
 */
const threeComponentDescriptions: Record<string, string> = {
  // Mirrored + Rotated + Inverted
  inverted_mirrored_rotated:
    "Combines the selected reflection axis, 180° rotation, and Pro/Anti inversion.",

  // Mirrored + Rotated + Swapped
  mirrored_rotated_swapped:
    "Combines the selected reflection axis, 180° rotation, and a left/right hand swap.",

  // Mirrored + Swapped + Inverted
  inverted_mirrored_swapped:
    "Combines the selected reflection axis, a left/right hand swap, and Pro/Anti inversion.",

  // Rotated + Swapped + Inverted
  inverted_rotated_swapped:
    "Applies 180° rotation, swaps hand roles (left ↔ right), and inverts motion types (Pro ↔ Anti).",
};

/**
 * Description for all four components.
 */
const fourComponentDescription =
  "Combines the selected reflection axis, 180° rotation, a left/right hand swap, and Pro/Anti inversion.";

/**
 * Generate a unique key for a set of components (sorted alphabetically).
 */
function getComponentKey(components: LOOPComponent[]): string {
  return [...components].sort().join("_");
}

/**
 * Generate explanation text based on selected components.
 */
export function generateExplanationText(
  selectedComponents: Set<LOOPComponent>
): string {
  const selected = Array.from(selectedComponents);

  if (selected.length === 0) {
    return "Select multiple components above to build a custom combo. The description will update to explain what your combination does.";
  }

  if (selected.length === 1) {
    return (
      singleDescriptions[selected[0]!] ??
      "This LOOP transformation is not user-facing."
    );
  }

  if (selected.length === 2) {
    const key = getComponentKey(selected);
    const description = twoComponentDescriptions[key];
    if (description) {
      return description;
    }
  }

  if (selected.length === 3) {
    const key = getComponentKey(selected);
    const description = threeComponentDescriptions[key];
    if (description) {
      return description;
    }
  }

  if (selected.length === 4) {
    return fourComponentDescription;
  }

  // Fallback for any unhandled combinations
  const labels = selected
    .map((c) => c.charAt(0).toUpperCase() + c.slice(1).toLowerCase())
    .join(" + ");
  return `Combines ${labels}. This transformation applies all selected operations to create a unique variation of your sequence.`;
}
