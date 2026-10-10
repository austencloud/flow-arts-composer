/**
 * Pictograph Example Loader
 *
 * Fetches real pictographs from the dataframe for transform examples.
 * Provides random selection with transform-specific filtering to ensure
 * the selected example will show a visible change when transformed.
 */

import { letterQueryHandler } from "#lib/shared/pictograph/tka-glyph/services/letter-query-handler.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { createMotionData, isVisibleMotion } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { GridMode, GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { MotionType, RotationDirection } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { calculateAllArrowPoints } from "#lib/shared/pictograph/arrow/orchestration/services/arrow-positioning-orchestrator.js";

export type TransformId = "mirror" | "flip" | "invert" | "rotate" | "swap" | "rewind";

// Cache loaded pictographs to avoid repeated fetches
let cachedPictographs: PictographData[] = [];
let loadingPromise: Promise<PictographData[]> | null = null;

// Locations with east/west components (Mirror needs these)
const EW_LOCATIONS: ReadonlySet<GridLocation> = new Set<GridLocation>([
  GridLocation.EAST,
  GridLocation.WEST,
  GridLocation.NORTHEAST,
  GridLocation.NORTHWEST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTHWEST,
]);

// Locations with north/south components (Flip needs these)
const NS_LOCATIONS: ReadonlySet<GridLocation> = new Set<GridLocation>([
  GridLocation.NORTH,
  GridLocation.SOUTH,
  GridLocation.NORTHEAST,
  GridLocation.NORTHWEST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTHWEST,
]);

/**
 * Check if a motion has E/W components (for Mirror visibility)
 */
function hasEastWestComponent(motion: MotionData): boolean {
  return EW_LOCATIONS.has(motion.startLocation) || EW_LOCATIONS.has(motion.endLocation);
}

/**
 * Check if a motion has N/S components (for Flip visibility)
 */
function hasNorthSouthComponent(motion: MotionData): boolean {
  return NS_LOCATIONS.has(motion.startLocation) || NS_LOCATIONS.has(motion.endLocation);
}

/**
 * Check if a motion has rotation (for Invert visibility)
 */
function hasRotation(motion: MotionData): boolean {
  return motion.rotationDirection === RotationDirection.CLOCKWISE ||
         motion.rotationDirection === RotationDirection.COUNTER_CLOCKWISE;
}

/**
 * Check if a motion moves (start ≠ end, for Rewind visibility)
 */
function hasMovement(motion: MotionData): boolean {
  return motion.startLocation !== motion.endLocation;
}

/**
 * Enhance a motion for invert demos by adding turns=1 only to dash motions.
 * Shifts already show pro/anti distinction at 0 turns, but dashes at 0 turns
 * have no rotation direction - so we add 1 turn to make the invert visible.
 *
 * When adding turns, we must also assign a rotation direction (CW) since the
 * original 0-turn dash had NO_ROTATION. Without a direction, the arrow
 * positioning system can't place the arrow correctly.
 */
function enhanceMotionForInvert(motion: MotionData): MotionData {
  const currentTurns = typeof motion.turns === 'number' ? motion.turns : 0;
  if (currentTurns > 0) {
    return motion; // Already has turns - no change needed
  }
  // Only dash motions need enhancement - at 0 turns they have no direction
  if (motion.motionType !== MotionType.DASH) {
    return motion;
  }
  return createMotionData({
    ...motion,
    turns: 1,
    rotationDirection: RotationDirection.CLOCKWISE,
  });
}

/**
 * Enhance a pictograph for invert demos by adding turns to dash motions.
 * Shifts show pro/anti at 0 turns so they stay unchanged. Dashes need 1 turn
 * to have a visible rotation direction. Recalculates arrow placement after.
 */
async function enhancePictographForInvert(pictograph: PictographData): Promise<PictographData> {
  const left = pictograph.motions?.left;
  const right = pictograph.motions?.right;

  // Only dash motions at 0 turns need enhancement
  const isDashAt0 = (m: MotionData | undefined) =>
    m?.motionType === MotionType.DASH && (typeof m.turns !== 'number' || m.turns === 0);
  const leftNeedsEnhancement = isDashAt0(left);
  const rightNeedsEnhancement = isDashAt0(right);

  if (!leftNeedsEnhancement && !rightNeedsEnhancement) {
    return pictograph; // No enhancement needed
  }

  // Create enhanced pictograph with turns=1 for dash motions
  const enhancedPictograph: PictographData = {
    ...pictograph,
    motions: {
      left: left ? enhanceMotionForInvert(left) : undefined,
      right: right ? enhanceMotionForInvert(right) : undefined,
    },
  };

  // Recalculate arrow placement for the enhanced pictograph
  try {
    return await calculateAllArrowPoints(enhancedPictograph);
  } catch (error) {
    console.warn("Failed to recalculate arrow placement for invert demo:", error);
    return enhancedPictograph; // Return without recalculated placement as fallback
  }
}

/**
 * Reclassify the letter of a pictograph by matching its motions against the dataframe.
 * After transforms like invert (pro↔anti), the motion combination maps to a different letter.
 * Returns the pictograph with the updated letter, or unchanged if no match is found.
 */
export async function reclassifyLetter(pictograph: PictographData): Promise<PictographData> {
  const left = pictograph.motions?.left;
  const right = pictograph.motions?.right;
  // Invisible placeholder = hand not really there (both-required Step shape).
  if (!isVisibleMotion(left) || !isVisibleMotion(right)) return pictograph;

  const allPictographs = await loadAllPictographs();

  // Find a dataframe entry that matches the transformed motion properties
  const match = allPictographs.find(p => {
    const pLeft = p.motions?.left;
    const pRight = p.motions?.right;
    if (!pLeft || !pRight) return false;

    return (
      pLeft.motionType === left.motionType &&
      pLeft.startLocation === left.startLocation &&
      pLeft.endLocation === left.endLocation &&
      pRight.motionType === right.motionType &&
      pRight.startLocation === right.startLocation &&
      pRight.endLocation === right.endLocation
    );
  });

  if (match?.letter) {
    return { ...pictograph, letter: match.letter };
  }

  return pictograph;
}

/**
 * Filter pictographs suitable for a specific transform
 */
function filterForTransform(pictographs: PictographData[], transformId: TransformId): PictographData[] {
  return pictographs.filter(p => {
    const left = p.motions?.left;
    const right = p.motions?.right;
    if (!isVisibleMotion(left) || !isVisibleMotion(right)) return false;

    switch (transformId) {
      case "mirror":
        // Need E/W components so mirror produces visible change
        return hasEastWestComponent(left) || hasEastWestComponent(right);

      case "flip":
        // Need N/S components so flip produces visible change
        return hasNorthSouthComponent(left) || hasNorthSouthComponent(right);

      case "invert":
        // Need rotation so invert produces visible change
        return hasRotation(left) || hasRotation(right);

      case "rewind":
        // Need movement so rewind produces visible change
        return hasMovement(left) || hasMovement(right);

      case "rotate":
        // Rotate always produces visible change
        return true;

      case "swap":
        // Swap always produces visible change (colors switch)
        // But filter out symmetric patterns where blue and red are identical
        return left.startLocation !== right.startLocation ||
               left.endLocation !== right.endLocation ||
               left.rotationDirection !== right.rotationDirection;

      default:
        return true;
    }
  });
}

/**
 * Load all pictographs from the dataframe (cached)
 */
export async function loadAllPictographs(): Promise<PictographData[]> {
  if (cachedPictographs.length > 0) return cachedPictographs;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const pictographs = await letterQueryHandler.getAllPictographVariations(
        GridMode.DIAMOND
      );
      // Filter out any invalid pictographs (need both hands really there)
      cachedPictographs = pictographs.filter(
        (p: PictographData) =>
          isVisibleMotion(p.motions?.left) && isVisibleMotion(p.motions?.right)
      );
      return cachedPictographs;
    } catch (error) {
      console.error("Failed to load pictographs:", error);
      return [];
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

/**
 * Get a random pictograph suitable for demonstrating a specific transform
 */
export async function getRandomPictographForTransform(
  transformId: TransformId
): Promise<PictographData | null> {
  const allPictographs = await loadAllPictographs();
  const suitable = filterForTransform(allPictographs, transformId);

  let selected: PictographData | null = null;

  if (suitable.length === 0) {
    // Fallback to any pictograph if no suitable ones found
    if (allPictographs.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * allPictographs.length);
    const fallback = allPictographs[randomIndex];
    selected = fallback ?? null;
  } else {
    const randomIndex = Math.floor(Math.random() * suitable.length);
    const candidate = suitable[randomIndex];
    selected = candidate ?? null;
  }

  // For invert demos, enhance the pictograph by adding turns to motions with rotation
  // This ensures dash motions with rotation direction show visible rotation
  if (selected && transformId === "invert") {
    selected = await enhancePictographForInvert(selected);
  }

  return selected;
}

/**
 * Result type for single-motion examples
 * Returns both the pictograph AND which hand to display
 */
export interface SingleMotionExample {
  pictograph: PictographData;
  visibleHand: "left" | "right";
}

/**
 * Check if a specific motion is suitable for a transform
 */
function isMotionSuitableForTransform(motion: MotionData | undefined, transformId: TransformId): boolean {
  if (!motion) return false;

  switch (transformId) {
    case "mirror":
      return hasEastWestComponent(motion);
    case "flip":
      return hasNorthSouthComponent(motion);
    case "invert":
      return hasRotation(motion);
    case "rewind":
      return hasMovement(motion);
    case "rotate":
      // Rotate always visible
      return true;
    case "swap":
      // Swap needs dual motion context - not meaningful for single
      return true;
    default:
      return true;
  }
}

/**
 * Get a random SINGLE motion suitable for demonstrating a specific transform.
 * Returns the pictograph AND which hand to show.
 *
 * This ensures the displayed motion will show a visible change when transformed:
 * - Mirror: motion has E/W component
 * - Flip: motion has N/S component
 * - Invert: motion has rotation
 * - Rewind: motion has movement (start ≠ end)
 */
export async function getRandomSingleMotionForTransform(
  transformId: TransformId
): Promise<SingleMotionExample | null> {
  const allPictographs = await loadAllPictographs();

  // Build a list of (pictograph, hand) pairs where the motion is suitable
  const candidates: SingleMotionExample[] = [];

  for (const p of allPictographs) {
    const left = p.motions?.left;
    const right = p.motions?.right;

    // Check left-hand motion.
    if (left && isMotionSuitableForTransform(left, transformId)) {
      candidates.push({ pictograph: p, visibleHand: "left" });
    }

    // Check right-hand motion (both can be valid).
    if (right && isMotionSuitableForTransform(right, transformId)) {
      candidates.push({ pictograph: p, visibleHand: "right" });
    }
  }

  if (candidates.length === 0) {
    // Fallback: pick any pictograph with blue hand visible
    if (allPictographs.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * allPictographs.length);
    const fallback = allPictographs[randomIndex];
    if (!fallback) return null;
    return { pictograph: fallback, visibleHand: "left" };
  }

  const randomIndex = Math.floor(Math.random() * candidates.length);
  return candidates[randomIndex] ?? null;
}

/**
 * Get a random pictograph from the dataframe (no filtering)
 * @deprecated Use getRandomPictographForTransform for transform examples
 */
export async function getRandomPictograph(): Promise<PictographData | null> {
  const pictographs = await loadAllPictographs();
  if (pictographs.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * pictographs.length);
  return pictographs[randomIndex] ?? null;
}

/**
 * Get multiple random pictographs (non-repeating)
 */
export async function getRandomPictographs(
  count: number
): Promise<PictographData[]> {
  const pictographs = await loadAllPictographs();
  if (pictographs.length === 0) return [];

  const shuffled = [...pictographs].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, pictographs.length));
}

/**
 * Check if pictographs are loaded
 */
export function isPictographsLoaded(): boolean {
  return cachedPictographs.length > 0;
}

/**
 * Get count of available pictographs
 */
export function getPictographCount(): number {
  return cachedPictographs.length;
}

/**
 * Get a random dual-motion pictograph suitable for a specific transform
 */
export async function getRandomDualMotionPictographForTransform(
  transformId: TransformId
): Promise<PictographData | null> {
  return getRandomPictographForTransform(transformId);
}

/**
 * @deprecated Use getRandomDualMotionPictographForTransform
 */
export async function getRandomDualMotionPictograph(): Promise<PictographData | null> {
  return getRandomPictograph();
}
