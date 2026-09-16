/**
 * Sequence Data Provider Types
 *
 * Co-exported types for the sequence data provider system.
 */

/**
 * Data for a single letter variation (one row in the CSV).
 */
export interface LetterVariationData {
  /** The letter */
  letter: string;
  /** Start position (e.g., "alpha1", "beta3") */
  startPlacement: string;
  /** End position */
  endPlacement: string;
  /** Blue motion type */
  leftMotionType: string;
  /** Blue start location */
  leftStartLocation: string;
  /** Blue end location */
  leftEndLocation: string;
  /** Blue rotation direction */
  leftRotationDirection: string;
  /** Red motion type */
  rightMotionType: string;
  /** Red start location */
  rightStartLocation: string;
  /** Red end location */
  rightEndLocation: string;
  /** Red rotation direction */
  rightRotationDirection: string;
  /** Grid mode (diamond, box, skewed) */
  gridMode?: string;
}
