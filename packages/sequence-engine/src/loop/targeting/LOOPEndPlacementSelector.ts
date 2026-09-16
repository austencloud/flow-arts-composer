/**
 * LOOP End Placement Selector
 *
 * Determines the required end placement for a partial sequence based on
 * the LOOP type being generated. Each LOOP type imposes a specific
 * positional constraint on where the partial sequence must end so that
 * the LOOP executor can transform it into a full circular sequence.
 *
 * Precedence order when combined:
 * 1. ROTATED (rotation takes precedence)
 * 2. MIRRORED (mirror takes precedence over inverted/swapped)
 * 3. INVERTED (return to start takes precedence over swapped)
 * 4. SWAPPED (only for strict swapped)
 *
 * Ported from app's LOOPEndPlacementSelector.ts.
 */

import {
  SWAPPED_PLACEMENT_MAP,
  VERTICAL_MIRROR_PLACEMENT_MAP,
  HORIZONTAL_MIRROR_PLACEMENT_MAP,
  reflectLocation,
} from "../placement-maps/strict-loop-placement-maps.js";
import {
  QUARTER_PLACEMENT_MAP_CW,
  LOCATION_MAP_CLOCKWISE,
} from "../placement-maps/circular-placement-maps.js";
import { LOOPType, Period } from "../loop-types.js";
import {
  RotatedEndPlacementSelector,
  rotatedEndPlacementSelector,
} from "./RotatedEndPlacementSelector.js";
import {
  LOOPComponent as CanonicalLOOPComponent,
  type LOOPSpec,
  type PropLOOPSpec,
  getReflectionAxis,
  specsAreEqual,
} from "../loop-spec.js";
import { gridPlacementDeriver } from "../../core/placements/GridPlacementDeriver.js";

export class LOOPEndPlacementSelector {
  constructor(private readonly rotatedSelector: RotatedEndPlacementSelector) {}

  /**
   * Determine the required end placement based on LOOP type.
   * @param loopType - The LOOP type being generated
   * @param startPlacement - The sequence's starting placement
   * @param period - Halved or quartered
   * @returns The required end placement, or null if no constraint (e.g., Rewound)
   * @deprecated Use determineEndPlacementForSpec instead.
   */
  determineEndPlacement(
    loopType: LOOPType,
    startPlacement: string,
    period: Period
  ): string | null {
    switch (loopType) {
      // Strict LOOP types
      case LOOPType.ROTATED:
        return this.rotatedSelector.determineRotatedEndPlacement(
          period,
          startPlacement
        );

      case LOOPType.MIRRORED:
        return VERTICAL_MIRROR_PLACEMENT_MAP[startPlacement] ?? null;

      case LOOPType.FLIPPED:
        return HORIZONTAL_MIRROR_PLACEMENT_MAP[startPlacement] ?? null;

      case LOOPType.SWAPPED:
        return SWAPPED_PLACEMENT_MAP[startPlacement] ?? null;

      case LOOPType.INVERTED:
        // Inverted LOOP returns to start placement (same placement)
        return startPlacement;

      // Rotated + Swapped (± Inverted): seed must end at swap(rotate(start)).
      // Alpha starts are degenerate — the hands already sit at each other's
      // 180° image, so rotate-then-swap is the per-hand identity and the
      // rotation vanishes. Beta (swap positionally invisible: same point) and
      // gamma (right angle) are genuine. Empirical: forced-start audits
      // 2026-07-13 — gamma 16/16, beta 25/25 exact-type detection.
      case LOOPType.ROTATED_SWAPPED:
      case LOOPType.ROTATED_SWAPPED_INVERTED: {
        if (startPlacement.startsWith("alpha")) return null;
        const rotatedEnd = this.rotatedSelector.determineRotatedEndPlacement(
          period,
          startPlacement
        );
        if (!rotatedEnd) return null;
        return SWAPPED_PLACEMENT_MAP[rotatedEnd] ?? null;
      }

      // Rotation is the inner expansion stage. Once it closes, the outer
      // mirror/swap stage expands that circular result from the same seam, so
      // it does not require a vertical-axis fixed point.
      case LOOPType.MIRRORED_ROTATED_SWAPPED:
      case LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED:
        return this.rotatedSelector.determineRotatedEndPlacement(
          period,
          startPlacement
        );

      // Combined LOOP types with ROTATED (rotation takes precedence)
      case LOOPType.ROTATED_INVERTED:
      case LOOPType.MIRRORED_ROTATED:
      case LOOPType.MIRRORED_INVERTED_ROTATED:
        return this.rotatedSelector.determineRotatedEndPlacement(
          period,
          startPlacement
        );

      // Combined LOOP types with MIRRORED
      case LOOPType.MIRRORED_INVERTED:
        return VERTICAL_MIRROR_PLACEMENT_MAP[startPlacement] ?? null;

      case LOOPType.MIRRORED_SWAPPED: {
        // First mirror, then swap
        const mirroredPlacement = VERTICAL_MIRROR_PLACEMENT_MAP[startPlacement];
        if (!mirroredPlacement) return null;
        return SWAPPED_PLACEMENT_MAP[mirroredPlacement] ?? null;
      }

      // Swapped + Inverted: the seed ends at the swapped placement. The executor
      // then re-swaps in createStep, so the full extended sequence's final end
      // placement lands back at start (swap is its own inverse). This matches
      // SWAPPED_LOOP_VALIDATION_SET used by the spec-executor pipeline.
      case LOOPType.SWAPPED_INVERTED:
        return SWAPPED_PLACEMENT_MAP[startPlacement] ?? null;

      // Inversion does not move either hand, so MSI has the same positional
      // seam as mirror+swap: end = swap(verticalMirror(start)). Requiring the
      // start itself to be fixed under both transforms incorrectly excludes
      // every Box placement.
      case LOOPType.MIRRORED_SWAPPED_INVERTED: {
        const mirroredPlacement = VERTICAL_MIRROR_PLACEMENT_MAP[startPlacement];
        if (!mirroredPlacement) return null;
        return SWAPPED_PLACEMENT_MAP[mirroredPlacement] ?? null;
      }

      // Rewound has no placement constraint — reversed steps return to start naturally
      case LOOPType.REWOUND:
        return null;

      default:
        throw new Error(
          `LOOP type "${loopType}" is not yet implemented for end placement selection.`
        );
    }
  }
}

export const loopEndPlacementSelector = new LOOPEndPlacementSelector(
  rotatedEndPlacementSelector
);

export function determineEndPlacementForSpec(
  spec: LOOPSpec,
  startPlacement: string
): string | null {
  if (!specsAreEqual(spec.left, spec.right)) return null;

  const [leftStart, rightStart] =
    gridPlacementDeriver.getGridLocationsFromPlacement(startPlacement);
  const propSpec = spec.left ?? spec.right;
  if (!propSpec || propSpec.components.size === 0) return startPlacement;
  if (propSpec.components.has(CanonicalLOOPComponent.REWOUND)) return null;

  const rotation = propSpec.components.get(CanonicalLOOPComponent.ROTATED);
  const fuseableAtRotationPeriod = rotation
    ? hasFuseableAtPeriod(propSpec, rotation.period)
    : false;
  const reflectionAtRotationPeriod = rotation
    ? hasReflectionAtPeriod(propSpec, rotation.period)
    : false;

  // ROTATED executes as its own inner expansion unless a same-period
  // swap/inversion group absorbs it. Later reflection stages receive the
  // already-closed inner sequence, so they do not constrain the original
  // seed seam.
  if (
    rotation &&
    (!fuseableAtRotationPeriod || reflectionAtRotationPeriod)
  ) {
    return derivePlacement(
      rotateLocation(leftStart, rotation.period),
      rotateLocation(rightStart, rotation.period)
    );
  }

  const firstPeriod = firstFuseablePeriod(propSpec);
  if (firstPeriod === null) return startPlacement;

  let leftEnd: string | null = leftStart;
  let rightEnd: string | null = rightStart;

  if (rotation?.period === firstPeriod) {
    leftEnd = rotateLocation(leftEnd, rotation.period);
    rightEnd = rotateLocation(rightEnd, rotation.period);
  }

  for (const component of [
    CanonicalLOOPComponent.MIRRORED,
    CanonicalLOOPComponent.FLIPPED,
  ]) {
    const componentSpec = propSpec.components.get(component);
    if (!componentSpec || componentSpec.period !== firstPeriod) continue;
    const axis = getReflectionAxis(component, componentSpec);
    if (!axis) continue;
    leftEnd = leftEnd === null ? null : reflectLocation(leftEnd, axis);
    rightEnd = rightEnd === null ? null : reflectLocation(rightEnd, axis);
  }

  const swap = propSpec.components.get(CanonicalLOOPComponent.SWAPPED);
  if (swap?.period === firstPeriod) {
    [leftEnd, rightEnd] = [rightEnd, leftEnd];
  }

  return derivePlacement(leftEnd, rightEnd);
}

function derivePlacement(
  leftLocation: string | null,
  rightLocation: string | null
): string | null {
  if (leftLocation === null || rightLocation === null) return null;
  return gridPlacementDeriver.getGridPlacementFromLocations(
    leftLocation,
    rightLocation
  );
}

function hasFuseableAtPeriod(
  spec: PropLOOPSpec,
  period: number
): boolean {
  for (const [component, componentSpec] of spec.components) {
    if (componentSpec.mode === "overlay") continue;
    if (
      componentSpec.period === period &&
      (component === CanonicalLOOPComponent.MIRRORED ||
        component === CanonicalLOOPComponent.FLIPPED ||
        component === CanonicalLOOPComponent.SWAPPED ||
        component === CanonicalLOOPComponent.INVERTED)
    ) {
      return true;
    }
  }
  return false;
}

function hasReflectionAtPeriod(
  spec: PropLOOPSpec,
  period: number
): boolean {
  for (const component of [
    CanonicalLOOPComponent.MIRRORED,
    CanonicalLOOPComponent.FLIPPED,
  ]) {
    const componentSpec = spec.components.get(component);
    if (
      componentSpec?.mode !== "overlay" &&
      componentSpec?.period === period
    ) {
      return true;
    }
  }
  return false;
}

function firstFuseablePeriod(spec: PropLOOPSpec): number | null {
  const groups = new Map<
    number,
    { hasSpatialTransform: boolean; invertOnly: boolean }
  >();

  for (const [component, componentSpec] of spec.components) {
    if (componentSpec.mode === "overlay") continue;
    const fuseable =
      component === CanonicalLOOPComponent.MIRRORED ||
      component === CanonicalLOOPComponent.FLIPPED ||
      component === CanonicalLOOPComponent.SWAPPED ||
      component === CanonicalLOOPComponent.INVERTED;
    if (!fuseable) continue;

    const current = groups.get(componentSpec.period) ?? {
      hasSpatialTransform: false,
      invertOnly: true,
    };
    if (component !== CanonicalLOOPComponent.INVERTED) {
      current.hasSpatialTransform = true;
      current.invertOnly = false;
    }
    groups.set(componentSpec.period, current);
  }

  const ordered = [...groups.entries()].sort(([periodA, groupA], [periodB, groupB]) => {
    const inversionRankA = groupA.invertOnly ? 1 : 0;
    const inversionRankB = groupB.invertOnly ? 1 : 0;
    if (inversionRankA !== inversionRankB) return inversionRankA - inversionRankB;
    return periodA - periodB;
  });
  return ordered[0]?.[0] ?? null;
}

function rotateLocation(loc: string, period: number): string | null {
  if (period === 2) {
    const quarterTurn = LOCATION_MAP_CLOCKWISE[loc];
    return quarterTurn ? LOCATION_MAP_CLOCKWISE[quarterTurn] ?? null : null;
  }
  if (period === 4) return LOCATION_MAP_CLOCKWISE[loc] ?? null;
  return null;
}
