import {
  OUTER_POINT_MULTIPLIER,
  SVG_CENTER,
} from "#lib/shared/multi-grid/domain/constants/grid-mode-offsets.js";
import { calculatePropCenter } from "#lib/shared/animation-engine/services/prop-position-calculator.js";
import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";
import type {
  ThirdOrderGridPose,
  ThirdOrderOrientationMode,
  ThirdOrderTimingMode,
} from "./third-order-composition";

export const THIRD_ORDER_VIEWBOX_SIZE = SVG_CENTER * 2;
export const THIRD_ORDER_CHILD_SCALE = 1 / OUTER_POINT_MULTIPLIER;

const EPSILON = 0.000_001;

export function wrapThirdOrderBeat(beat: number, totalBeats: number): number {
  if (!Number.isFinite(beat) || totalBeats <= 0) return 0;
  return ((beat % totalBeats) + totalBeats) % totalBeats;
}

export function mapThirdOrderChildStep(
  masterBeat: number,
  childSteps: number,
  carrierSteps: number,
  mode: ThirdOrderTimingMode,
  rate = 1
): number {
  if (childSteps <= 0) return 0;

  if (mode === "phrase") {
    if (carrierSteps <= 0) return 0;
    return wrapThirdOrderBeat(
      masterBeat * (childSteps / carrierSteps),
      childSteps
    );
  }

  const resolvedRate = mode === "independent" ? Math.max(0.05, rate) : 1;
  return wrapThirdOrderBeat(masterBeat * resolvedRate, childSteps);
}

function directionFromCenter(x: number, y: number): number {
  return Math.atan2(SVG_CENTER - y, SVG_CENTER - x);
}

function gridNorthToDirection(direction: number): number {
  return direction + Math.PI / 2;
}

export function resolveThirdOrderGridPose(
  carrier: PropState,
  nextCarrier: PropState,
  orientationMode: ThirdOrderOrientationMode
): ThirdOrderGridPose {
  const center = calculatePropCenter(carrier, {
    canvasSize: THIRD_ORDER_VIEWBOX_SIZE,
    propDimensions: { width: 0, height: 0 },
  });
  const nextCenter = calculatePropCenter(nextCarrier, {
    canvasSize: THIRD_ORDER_VIEWBOX_SIZE,
    propDimensions: { width: 0, height: 0 },
  });

  let rotation = 0;
  if (orientationMode === "radial") {
    rotation = gridNorthToDirection(directionFromCenter(center.x, center.y));
  } else if (orientationMode === "tangent") {
    const dx = nextCenter.x - center.x;
    const dy = nextCenter.y - center.y;
    rotation =
      Math.abs(dx) + Math.abs(dy) > EPSILON
        ? gridNorthToDirection(Math.atan2(dy, dx))
        : gridNorthToDirection(
            directionFromCenter(center.x, center.y) + Math.PI / 2
          );
  } else if (orientationMode === "carrier") {
    rotation = gridNorthToDirection(carrier.staffRotationAngle);
  }

  return {
    centerX: center.x,
    centerY: center.y,
    rotation,
    scale: THIRD_ORDER_CHILD_SCALE,
  };
}
