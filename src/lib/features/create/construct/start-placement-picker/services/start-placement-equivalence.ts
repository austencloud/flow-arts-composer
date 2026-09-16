import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

interface HandBoundary {
  location: string;
  orientation: string;
  visible: boolean;
}

function getGridMode(placement: PictographData): GridMode | null {
  return (
    placement.gridMode ??
    placement.motions[HandSide.LEFT]?.gridMode ??
    placement.motions[HandSide.RIGHT]?.gridMode ??
    null
  );
}

function getHandBoundary(
  placement: PictographData,
  color: HandSide
): HandBoundary | null {
  const motion = placement.motions[color];
  if (!motion) return null;

  return {
    location: motion.endLocation,
    orientation: motion.endOrientation,
    visible: motion.isVisible,
  };
}

function hasSameHandBoundary(
  first: PictographData,
  second: PictographData,
  color: HandSide
): boolean {
  const firstBoundary = getHandBoundary(first, color);
  const secondBoundary = getHandBoundary(second, color);

  return (
    firstBoundary?.location === secondBoundary?.location &&
    firstBoundary?.orientation === secondBoundary?.orientation &&
    firstBoundary?.visible === secondBoundary?.visible
  );
}

/**
 * Compares the held pose, not render metadata or object identity. Canonical
 * placements carry a numbered startPlacement; custom placements fall back to the
 * two hand boundaries that define the pose.
 */
export function areStartPlacementsEquivalent(
  first: PictographData | null,
  second: PictographData | null
): boolean {
  if (first === second) return true;
  if (!first || !second) return false;
  if (getGridMode(first) !== getGridMode(second)) return false;

  if (first.startPlacement || second.startPlacement) {
    return (
      first.startPlacement === second.startPlacement &&
      first.letter === second.letter
    );
  }

  return (
    hasSameHandBoundary(first, second, HandSide.LEFT) &&
    hasSameHandBoundary(first, second, HandSide.RIGHT)
  );
}
