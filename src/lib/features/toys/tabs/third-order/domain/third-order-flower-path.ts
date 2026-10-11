import { makeSpinRatio, spinRatioPetals, type SpinRatio } from "@vtg/domain";
import {
  angleOf,
  handIndexAt,
  pointAt,
  propIndexAt,
  type QftKnobs,
} from "#lib/shared/notation/qft/qft-model.js";
import {
  THIRD_ORDER_CHILD_SCALE,
  THIRD_ORDER_VIEWBOX_SIZE,
  wrapThirdOrderBeat,
} from "./third-order-math";
import type {
  ThirdOrderCarrierLane,
  ThirdOrderCarrierPathDraft,
  ThirdOrderFlowerDecomposition,
  ThirdOrderFlowerRatio,
  ThirdOrderGridPose,
  ThirdOrderOrientationMode,
  ThirdOrderPoint,
} from "./third-order-composition";

/** The canonical FAC hand-point ring used by the parent grid. */
export const THIRD_ORDER_FLOWER_RADIUS = 150;

const COMPASS_STEPS = 8;
const TANGENT_SAMPLE = 0.002;
const EPSILON = 0.000_001;

// `VtgMode` is a 2-character string union ("SS" | "TS" | ...), so `VtgMode[0]`
// resolves through `String`'s numeric index signature to plain `string`
// rather than the literal first-character type — this alias names what the
// timing digit actually is.
type VtgTiming = "S" | "T" | "Q";

const TIMING_OFFSET: Record<VtgTiming, number> = {
  S: 4,
  T: 0,
  Q: 2,
};

function displayRatioParts(ratio: ThirdOrderFlowerRatio): {
  primaryCycles: number;
  orbitCycles: number;
} {
  const [primaryPart, orbitPart] = ratio.split(":");
  if (primaryPart === undefined || orbitPart === undefined) {
    throw new Error(`Malformed third-order flower ratio: "${ratio}"`);
  }
  return { primaryCycles: Number(primaryPart), orbitCycles: Number(orbitPart) };
}

/**
 * Third Order names its ratio primary:orbit, matching the imported Spiro
 * control. QfT stores the same relationship orbit:primary because its ratio is
 * prop rotations per hand cycle. This adapter is the one translation point.
 */
export function thirdOrderRatioToSpinRatio(
  ratio: ThirdOrderFlowerRatio
): SpinRatio {
  const { primaryCycles, orbitCycles } = displayRatioParts(ratio);
  return makeSpinRatio(orbitCycles, primaryCycles);
}

export function thirdOrderFlowerClosureCycles(
  ratio: ThirdOrderFlowerRatio
): number {
  return displayRatioParts(ratio).primaryCycles;
}

export function thirdOrderFlowerTotalBeats(
  ratio: ThirdOrderFlowerRatio,
  carrierSteps: number
): number {
  return Math.max(0, carrierSteps) * thirdOrderFlowerClosureCycles(ratio);
}

export function thirdOrderFlowerPetals(
  path: Pick<ThirdOrderCarrierPathDraft, "ratio" | "style">
): number {
  return spinRatioPetals(thirdOrderRatioToSpinRatio(path.ratio), path.style);
}

function knobsFor(
  path: ThirdOrderCarrierPathDraft,
  lane: ThirdOrderCarrierLane
): QftKnobs {
  const ratio = thirdOrderRatioToSpinRatio(path.ratio);
  const timing = path.relationship.charAt(0) as VtgTiming;
  const opposite = path.relationship.charAt(1) === "O";
  return {
    radius: 1,
    downbeats: ratio.propRotations / ratio.handCycles,
    ratio,
    spin: path.style === "pro" ? "inspin" : "antispin",
    phase: path.phase,
    handPhase: 8 + (lane === "right" ? TIMING_OFFSET[timing] : 0),
    handDirection: lane === "right" && opposite ? -1 : 1,
  };
}

function radiiFor(path: ThirdOrderCarrierPathDraft): {
  primary: number;
  orbit: number;
} {
  const strength = Math.max(0, Math.min(1, path.strength));
  return {
    primary: THIRD_ORDER_FLOWER_RADIUS * (1 - strength / 2),
    orbit: THIRD_ORDER_FLOWER_RADIUS * (strength / 2),
  };
}

function pointFor(
  path: ThirdOrderCarrierPathDraft,
  lane: ThirdOrderCarrierLane,
  u: number
): ThirdOrderFlowerDecomposition {
  const knobs = knobsFor(path, lane);
  const radii = radiiFor(path);
  const primary = pointAt(handIndexAt(knobs, u), radii.primary);
  const orbit = pointAt(propIndexAt(knobs, u), radii.orbit);
  const center = THIRD_ORDER_VIEWBOX_SIZE / 2;
  const origin = { x: center, y: center };
  const pivot = { x: center + primary.x, y: center + primary.y };
  return {
    origin,
    pivot,
    center: { x: pivot.x + orbit.x, y: pivot.y + orbit.y },
    primaryRadius: radii.primary,
    orbitRadius: radii.orbit,
  };
}

function beatToCompassStep(masterBeat: number, carrierSteps: number): number {
  if (carrierSteps <= 0) return 0;
  return (masterBeat / carrierSteps) * COMPASS_STEPS;
}

function gridNorthToDirection(direction: number): number {
  return direction + Math.PI / 2;
}

function rotationFor(
  path: ThirdOrderCarrierPathDraft,
  lane: ThirdOrderCarrierLane,
  u: number,
  decomposition: ThirdOrderFlowerDecomposition,
  mode: ThirdOrderOrientationMode
): number {
  if (mode === "world") return 0;

  if (mode === "carrier") {
    return angleOf(handIndexAt(knobsFor(path, lane), u));
  }

  if (mode === "radial") {
    return gridNorthToDirection(
      Math.atan2(
        decomposition.origin.y - decomposition.center.y,
        decomposition.origin.x - decomposition.center.x
      )
    );
  }

  const before = pointFor(path, lane, u - TANGENT_SAMPLE).center;
  const after = pointFor(path, lane, u + TANGENT_SAMPLE).center;
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  if (Math.abs(dx) + Math.abs(dy) > EPSILON) {
    return gridNorthToDirection(Math.atan2(dy, dx));
  }

  return gridNorthToDirection(
    Math.atan2(
      decomposition.origin.y - decomposition.center.y,
      decomposition.origin.x - decomposition.center.x
    ) +
      Math.PI / 2
  );
}

export function sampleThirdOrderFlowerPose(
  path: ThirdOrderCarrierPathDraft,
  lane: ThirdOrderCarrierLane,
  masterBeat: number,
  carrierSteps: number,
  orientationMode: ThirdOrderOrientationMode
): { pose: ThirdOrderGridPose; decomposition: ThirdOrderFlowerDecomposition } {
  const totalBeats = thirdOrderFlowerTotalBeats(path.ratio, carrierSteps);
  const resolvedBeat = wrapThirdOrderBeat(masterBeat, totalBeats);
  const u = beatToCompassStep(resolvedBeat, carrierSteps);
  const decomposition = pointFor(path, lane, u);
  return {
    pose: {
      centerX: decomposition.center.x,
      centerY: decomposition.center.y,
      rotation: rotationFor(path, lane, u, decomposition, orientationMode),
      scale: THIRD_ORDER_CHILD_SCALE,
    },
    decomposition,
  };
}

export function traceThirdOrderFlowerPath(
  path: ThirdOrderCarrierPathDraft,
  lane: ThirdOrderCarrierLane,
  samples = 320
): ThirdOrderPoint[] {
  const closureCycles = thirdOrderFlowerClosureCycles(path.ratio);
  return Array.from({ length: samples + 1 }, (_, index) => {
    const u = (index / samples) * COMPASS_STEPS * closureCycles;
    return pointFor(path, lane, u).center;
  });
}
