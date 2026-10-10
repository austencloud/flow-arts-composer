import { DURATION } from "#lib/shared/transitions/transitions.js";
import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";
import { normalizeAngleSigned } from "#lib/shared/animation-engine/services/angle-calculator.js";

/** One structural phrase: reveal the prepared formation and settle. */
export const TUNNEL_REVEAL_DURATION = DURATION.emphasis + DURATION.normal;

function clampProgress(progress: number): number {
  return Math.max(0, Math.min(1, progress));
}

/**
 * Seven copies still need to read as one ensemble, not seven late disclosures.
 * This keeps the farthest copy only a fraction of a phrase behind the first.
 */
const LAYER_OPACITY_STAGGER = 0.18;

function layerStart(
  layerIndex: number,
  layerCount: number,
  staggerWindow: number
): number {
  if (layerCount <= 1) return 0;
  const index = Math.max(0, Math.min(layerCount - 1, layerIndex));
  return (index / (layerCount - 1)) * staggerWindow;
}

/**
 * Per-copy progress through the formation crossfade.
 *
 * The copies are already at their authored poses. This slight offset keeps the
 * ensemble from appearing as one flat flash without making anyone travel into
 * place.
 */
export function resolveTunnelLayerProgress(
  progress: number,
  layerIndex: number,
  layerCount: number
): number {
  const clampedProgress = clampProgress(progress);
  if (layerCount <= 1) return clampedProgress;

  const start = layerStart(layerIndex, layerCount, LAYER_OPACITY_STAGGER);
  const localProgress = clampProgress((clampedProgress - start) / (1 - start));
  // The shared Tween already supplies the product's cubic-out easing. Easing
  // again here held six of seven copies near zero until the final beat, then
  // compressed their visible movement into a burst.
  return localProgress;
}

function propPosition(state: PropState): { x: number; y: number } {
  if (state.x !== undefined && state.y !== undefined) {
    return { x: state.x, y: state.y };
  }
  return {
    x: Math.cos(state.centerPathAngle),
    y: Math.sin(state.centerPathAngle),
  };
}

/**
 * Difference between the pose being rendered and the authored Tunnel pose.
 *
 * Position is measured in grid-radius units. Angles are normalized to a half
 * turn so either kind of scramble produces a comparable non-zero signal.
 */
export function tunnelLayerPoseDifference(
  expected: PropState | null,
  current: PropState | null
): number {
  if (expected === null || current === null) {
    return expected === current ? 0 : 1;
  }
  const expectedPosition = propPosition(expected);
  const currentPosition = propPosition(current);
  // When neither pose has explicit canvas coordinates, centerPathAngle already
  // describes its location and is graded below. Counting the unit-circle chord
  // as well would report the same angular difference twice. If either pose has
  // explicit coordinates, compare in canvas space and derive only the missing
  // endpoint from its angle.
  const hasExplicitPosition =
    (expected.x !== undefined && expected.y !== undefined) ||
    (current.x !== undefined && current.y !== undefined);
  const positionDifference = hasExplicitPosition
    ? Math.hypot(
        currentPosition.x - expectedPosition.x,
        currentPosition.y - expectedPosition.y
      )
    : 0;
  const pathDifference =
    Math.abs(
      normalizeAngleSigned(current.centerPathAngle - expected.centerPathAngle)
    ) / Math.PI;
  const rotationDifference =
    Math.abs(
      normalizeAngleSigned(
        current.staffRotationAngle - expected.staffRotationAngle
      )
    ) / Math.PI;
  return Math.max(positionDifference, pathDifference, rotationDifference);
}

/**
 * Extra performers crossfade in with a slight center-out depth stagger. The
 * offset is deliberately subtle: depth remains legible, while
 * every copy is already participating before the reveal reaches its midpoint.
 */
export function resolveTunnelLayerOpacity(
  progress: number,
  layerIndex: number,
  layerCount: number
): number {
  return resolveTunnelLayerProgress(progress, layerIndex, layerCount);
}

/**
 * The ordinary 2D grid leaves on the same progress that introduces Tunnel.
 * A Tunnel whose own grid is enabled keeps it throughout the transformation.
 */
export function resolveTunnelGridOpacity(
  progress: number,
  tunnelGridVisible: boolean
): number {
  if (tunnelGridVisible) return 1;
  // The grid and performers share one eased clock. The grid therefore remains
  // visible while the copies become legible, then clears as their formation
  // takes ownership instead of vanishing before anything replaces it.
  return 1 - clampProgress(progress);
}
