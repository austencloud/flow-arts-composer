/**
 * Trigrid Lab Color Constants
 *
 * Semantic hand colors (blue/red) and their UI tints, hoisted here so the
 * controls and placement-info components share one source of truth instead of
 * scattering identical hex literals across two stylesheets.
 *
 * Blue = blue-hand prop, Red = red-hand prop. These are domain-semantic data
 * colors (not theme chrome), so they live as constants rather than tokens.
 */

/** Blue prop color (matches the existing pictograph convention). */
export const BLUE_PROP_COLOR = "#2563eb";
/** Red prop color (matches the existing pictograph convention). */
export const RED_PROP_COLOR = "#dc2626";

/** Lighter blue used for active text / labels on dark surfaces. */
export const BLUE_TEXT = "#60a5fa";
/** Lighter red used for active text / labels on dark surfaces. */
export const RED_TEXT = "#f87171";

/** Tint behind active blue elements / beta badges. */
export const BLUE_TINT = "rgba(59, 130, 246, 0.2)";
/** Stronger blue tint behind active blue orientation buttons. */
export const BLUE_TINT_STRONG = "rgba(37, 99, 235, 0.3)";

/** Green text used for gamma badges. */
export const GAMMA_TEXT = "#34d399";
/** Tint behind gamma badges. */
export const GAMMA_TINT = "rgba(16, 185, 129, 0.2)";

/** Tint behind active red orientation buttons. */
export const RED_TINT_STRONG = "rgba(220, 38, 38, 0.3)";
