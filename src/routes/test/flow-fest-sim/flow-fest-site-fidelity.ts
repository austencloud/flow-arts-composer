import type { ImportedTerrainDataV2 } from "#lib/shared/3d/procedural-engine/generation/real-terrain-zone.js";
import {
  allFlowFestSegments,
  type FlowFestBranchId,
  type FlowFestRuntimeContract,
  type FlowFestRuntimePoint,
  type FlowFestRuntimeSegment,
  type FlowFestRuntimeZone,
} from "../flow-fest-graybox/flow-fest-runtime-contract";

export interface FlowFestCanopyEvidence {
  offsetsCentimeters: Uint16Array;
  width: number;
  height: number;
}

export interface FlowFestBoundsWorldMeters {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * How one detection pass reads the canopy raster. Every field defaults to the
 * registered site survey, so an unconfigured call behaves exactly as before.
 *
 * The options exist because the raster is a full square kilometre while the
 * site is a 540 x 210 m strip inside it. The land beyond the property line is
 * measured woodland — 38.9% of its samples clear the tall-canopy threshold,
 * against 43.8% inside — and the horizon read as bare hills only because
 * nothing ever sampled it.
 */
export interface FlowFestCanopyPeakOptions {
  /** Sample window. Defaults to the contract's active site bounds. */
  readonly bounds?: FlowFestBoundsWorldMeters;
  /** A window to skip, so two passes cannot both claim the same peak. */
  readonly excludeBounds?: FlowFestBoundsWorldMeters | null;
  /** Distance between retained peaks. Defaults to the site's 7.5 m. */
  readonly minimumSpacingMeters?: number;
  /**
   * Whether candidates are cut away from registered routes and zones. Only the
   * site has those; a pass over the surrounding county has nothing to avoid,
   * and the per-sample segment distance is the expensive part of this loop.
   */
  readonly avoidRegisteredSurfaces?: boolean;
}

export interface FlowFestCanopyPeak {
  x: number;
  z: number;
  measuredHeightMeters: number;
  neighborhoodHighReturnRatio: number;
}

const CANOPY_MINIMUM_HEIGHT_CENTIMETERS = 600;
const HIGH_RETURN_CENTIMETERS = 400;
const LOCAL_MAXIMUM_RADIUS_SAMPLES = 2;
const MINIMUM_HIGH_RETURN_RATIO = 0.45;
const MINIMUM_PEAK_SPACING_METERS = 7.5;
const ROUTE_EDGE_CLEARANCE_METERS = 3.2;
const ZONE_EDGE_CLEARANCE_METERS = 3;

/**
 * Derive stable canopy candidates from the measured surface-return raster.
 *
 * These are intentionally called candidates, not surveyed tree trunks. A local
 * maximum plus a dense high-return neighborhood removes the old artificial
 * nine-metre planting grid while keeping the result tied to the LiDAR surface.
 */
export function deriveFlowFestCanopyPeaks(
  contract: FlowFestRuntimeContract,
  terrain: ImportedTerrainDataV2,
  canopy: FlowFestCanopyEvidence,
  options: FlowFestCanopyPeakOptions = {}
): FlowFestCanopyPeak[] {
  const candidates: FlowFestCanopyPeak[] = [];
  const avoidRegisteredSurfaces = options.avoidRegisteredSurfaces ?? true;
  const routes = avoidRegisteredSurfaces
    ? uniqueFlowFestSurfaceSegments(contract)
    : [];
  const bounds =
    options.bounds ?? contract.surfaceEvidenceProxy.activeBoundsWorldMeters;
  const excludeBounds = options.excludeBounds ?? null;
  const minimumSpacingMeters =
    options.minimumSpacingMeters ?? MINIMUM_PEAK_SPACING_METERS;

  for (let z = Math.ceil(bounds.minZ); z <= Math.floor(bounds.maxZ); z += 1) {
    for (let x = Math.ceil(bounds.minX); x <= Math.floor(bounds.maxX); x += 1) {
      if (
        excludeBounds &&
        x >= excludeBounds.minX &&
        x <= excludeBounds.maxX &&
        z >= excludeBounds.minZ &&
        z <= excludeBounds.maxZ
      ) {
        continue;
      }
      if (
        avoidRegisteredSurfaces &&
        (pointInRegisteredZone(x, z, contract.zones) ||
          pointNearRoutes(x, z, routes, ROUTE_EDGE_CLEARANCE_METERS))
      ) {
        continue;
      }
      const sample = worldToCanopySample(terrain, canopy, x, z);
      if (!sample) continue;
      const measured = canopy.offsetsCentimeters[sample.index];
      if (
        measured == null ||
        measured === 65535 ||
        measured < CANOPY_MINIMUM_HEIGHT_CENTIMETERS
      ) {
        continue;
      }

      let valid = 0;
      let highReturns = 0;
      let superseded = false;
      for (
        let dz = -LOCAL_MAXIMUM_RADIUS_SAMPLES;
        dz <= LOCAL_MAXIMUM_RADIUS_SAMPLES;
        dz += 1
      ) {
        const row = sample.row + dz;
        if (row < 0 || row >= canopy.height) continue;
        for (
          let dx = -LOCAL_MAXIMUM_RADIUS_SAMPLES;
          dx <= LOCAL_MAXIMUM_RADIUS_SAMPLES;
          dx += 1
        ) {
          const column = sample.column + dx;
          if (column < 0 || column >= canopy.width) continue;
          const value = canopy.offsetsCentimeters[row * canopy.width + column];
          if (value == null || value === 65535) continue;
          valid += 1;
          if (value >= HIGH_RETURN_CENTIMETERS) highReturns += 1;
          if (
            value > measured ||
            (value === measured && (dz < 0 || (dz === 0 && dx < 0)))
          ) {
            superseded = true;
          }
        }
      }
      if (superseded || valid === 0) continue;
      const neighborhoodHighReturnRatio = highReturns / valid;
      if (neighborhoodHighReturnRatio < MINIMUM_HIGH_RETURN_RATIO) continue;
      candidates.push({
        x,
        z,
        measuredHeightMeters: measured / 100,
        neighborhoodHighReturnRatio,
      });
    }
  }

  candidates.sort(
    (first, second) =>
      second.measuredHeightMeters - first.measuredHeightMeters ||
      first.z - second.z ||
      first.x - second.x
  );
  // Bucket retained peaks by spacing-sized cell. A peak closer than the spacing
  // can only live in the eight cells around the candidate's own, so this is the
  // same result the pairwise scan produced, without its quadratic cost over the
  // thousands of candidates a full-raster pass turns up.
  const retained: FlowFestCanopyPeak[] = [];
  const occupied = new Map<string, FlowFestCanopyPeak[]>();
  for (const candidate of candidates) {
    const cellX = Math.floor(candidate.x / minimumSpacingMeters);
    const cellZ = Math.floor(candidate.z / minimumSpacingMeters);
    let crowded = false;
    for (let dz = -1; dz <= 1 && !crowded; dz += 1) {
      for (let dx = -1; dx <= 1 && !crowded; dx += 1) {
        const cell = occupied.get(`${cellX + dx}:${cellZ + dz}`);
        if (!cell) continue;
        crowded = cell.some(
          (peak) =>
            Math.hypot(peak.x - candidate.x, peak.z - candidate.z) <
            minimumSpacingMeters
        );
      }
    }
    if (crowded) continue;
    retained.push(candidate);
    const key = `${cellX}:${cellZ}`;
    const cell = occupied.get(key);
    if (cell) cell.push(candidate);
    else occupied.set(key, [candidate]);
  }
  return retained;
}

/** De-duplicate shared/reversed branch legs without changing any source point. */
export function uniqueFlowFestSurfaceSegments(
  contract: FlowFestRuntimeContract
): FlowFestRuntimeSegment[] {
  const unique = new Map<string, FlowFestRuntimeSegment>();
  for (const segment of allFlowFestSegments(contract)) {
    const forward = pointSignature(segment.points);
    const reverse = pointSignature([...segment.points].reverse());
    const key = `${segment.mode}:${forward < reverse ? forward : reverse}`;
    if (!unique.has(key)) unique.set(key, segment);
  }
  return [...unique.values()];
}

/** Resolve the authored, untimed vehicle stage without substituting a camera. */
export function getFlowFestVehicleStagePoint(
  contract: FlowFestRuntimeContract,
  branch: FlowFestBranchId,
  endpoint: "unload" | "settled"
): FlowFestRuntimePoint | null {
  const vehicleSegments = contract.routes.arrivalBranches[
    branch
  ].segments.filter((segment) => segment.mode === "vehicle");
  const segment =
    endpoint === "unload"
      ? vehicleSegments[0]
      : vehicleSegments[vehicleSegments.length - 1];
  return segment?.points[segment.points.length - 1] ?? null;
}

function pointSignature(points: FlowFestRuntimePoint[]): string {
  return points.map((point) => `${point.x},${point.z}`).join(";");
}

function worldToCanopySample(
  terrain: ImportedTerrainDataV2,
  canopy: FlowFestCanopyEvidence,
  x: number,
  z: number
): { row: number; column: number; index: number } | null {
  const column = Math.round(
    ((x - terrain.worldBounds.minX) /
      (terrain.worldBounds.maxX - terrain.worldBounds.minX)) *
      (canopy.width - 1)
  );
  const row = Math.round(
    ((z - terrain.worldBounds.minZ) /
      (terrain.worldBounds.maxZ - terrain.worldBounds.minZ)) *
      (canopy.height - 1)
  );
  if (column < 0 || row < 0 || column >= canopy.width || row >= canopy.height) {
    return null;
  }
  return { row, column, index: row * canopy.width + column };
}

function pointInRegisteredZone(
  x: number,
  z: number,
  zones: FlowFestRuntimeZone[]
): boolean {
  return zones.some((zone) => {
    const radiusX = zone.radiusMeters ?? zone.searchRadiusXMeters ?? 0;
    const radiusZ = zone.radiusMeters ?? zone.searchRadiusZMeters ?? 0;
    if (radiusX <= 0 || radiusZ <= 0) return false;
    const normalizedX =
      (x - zone.center.x) / (radiusX + ZONE_EDGE_CLEARANCE_METERS);
    const normalizedZ =
      (z - zone.center.z) / (radiusZ + ZONE_EDGE_CLEARANCE_METERS);
    return normalizedX * normalizedX + normalizedZ * normalizedZ <= 1;
  });
}

function pointNearRoutes(
  x: number,
  z: number,
  routes: FlowFestRuntimeSegment[],
  extraClearanceMeters: number
): boolean {
  return routes.some((route) => {
    const clearance = route.widthMeters / 2 + extraClearanceMeters;
    for (let index = 1; index < route.points.length; index += 1) {
      if (
        distanceToSegment(
          x,
          z,
          route.points[index - 1]!,
          route.points[index]!
        ) <= clearance
      ) {
        return true;
      }
    }
    return false;
  });
}

function distanceToSegment(
  x: number,
  z: number,
  start: FlowFestRuntimePoint,
  end: FlowFestRuntimePoint
): number {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  if (lengthSquared === 0) return Math.hypot(x - start.x, z - start.z);
  const progress = Math.max(
    0,
    Math.min(
      1,
      ((x - start.x) * deltaX + (z - start.z) * deltaZ) / lengthSquared
    )
  );
  return Math.hypot(
    x - (start.x + deltaX * progress),
    z - (start.z + deltaZ * progress)
  );
}
