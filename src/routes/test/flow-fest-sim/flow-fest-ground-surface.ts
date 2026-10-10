import type { ImportedTerrainDataV2 } from "#lib/shared/3d/procedural-engine/generation/real-terrain-zone.js";
import {
  allFlowFestCampPlanLines,
  type FlowFestCampPlan,
  type FlowFestCampPlanLine,
  type FlowFestCampPlanRegion,
} from "./flow-fest-camp-plan";
import type { FlowFestForestEcologyLayout } from "./flow-fest-forest-ecology";

export type FlowFestGroundFamily = "packed" | "meadow" | "litter" | "damp";

export interface FlowFestGroundFamilyMask {
  width: number;
  height: number;
  data: Uint8Array;
  maskOrigin: { x: number; y: number };
  maskSize: { x: number; y: number };
  worldAxisSign: { x: 1; y: -1 };
  audit: {
    resolutionMetersPerPixel: number;
    packedPixels: number;
    meadowPixels: number;
    litterPixels: number;
    dampPixels: number;
    lowerLoopPaintedPixels: number;
    sourceRouteCount: number;
  };
}

const MASK_RESOLUTION = 512;
const FAMILY_TARGETS: Record<
  FlowFestGroundFamily,
  readonly [number, number, number]
> = {
  packed: [255, 0, 0],
  meadow: [0, 255, 0],
  litter: [0, 0, 255],
  damp: [0, 0, 0],
};

interface GroundMaskPainter {
  data: Uint8Array;
  width: number;
  height: number;
  bounds: ImportedTerrainDataV2["worldBounds"];
  metresPerPixelX: number;
  metresPerPixelZ: number;
}

/**
 * The mask changes how the measured ground reads without changing one terrain
 * vertex. Broad land-cover families come from the shared camp plan; LiDAR-led
 * tree placements add forest-floor contact; every registered route cuts the
 * same packed-ground corridor used by navigation and vegetation clearance.
 */
export function buildFlowFestGroundFamilyMask(
  plan: FlowFestCampPlan,
  ecology: FlowFestForestEcologyLayout,
  worldBounds: ImportedTerrainDataV2["worldBounds"],
  resolution = MASK_RESOLUTION
): FlowFestGroundFamilyMask {
  const width = resolution;
  const height = resolution;
  const data = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    data[pixel * 4 + 2] = 255;
    data[pixel * 4 + 3] = 255;
  }
  const painter: GroundMaskPainter = {
    data,
    width,
    height,
    bounds: worldBounds,
    metresPerPixelX: (worldBounds.maxX - worldBounds.minX) / width,
    metresPerPixelZ: (worldBounds.maxZ - worldBounds.minZ) / height,
  };

  for (const region of plan.regions) {
    const family = regionFamily(region);
    if (region.shape === "ellipse") {
      paintEllipse(painter, region, family);
    } else {
      paintPolygon(painter, region, family);
    }
  }

  for (const tree of ecology.trees) {
    paintCircle(
      painter,
      tree.x,
      tree.z,
      Math.max(2.4, tree.crownRadiusMeters * 0.82),
      "litter",
      0.78,
      2.2
    );
  }
  for (const plant of ecology.groundLife) {
    if (plant.species !== "damp-sedge-tussock") continue;
    paintCircle(painter, plant.x, plant.z, 2.8, "damp", 0.72, 2.4);
  }

  let lowerLoopPaintedPixels = 0;
  const routes = allFlowFestCampPlanLines(plan);
  for (const route of routes) {
    const paintedPixels = paintRoute(
      painter,
      route,
      route.kind === "foot-connector" ? 1.3 : 2.5
    );
    if (route.id === "lower-campground-loop") {
      lowerLoopPaintedPixels = paintedPixels;
    }
  }

  const familyCounts = countFamilies(data);
  return {
    width,
    height,
    data,
    maskOrigin: { x: worldBounds.minX, y: -worldBounds.maxZ },
    maskSize: {
      x: worldBounds.maxX - worldBounds.minX,
      y: worldBounds.maxZ - worldBounds.minZ,
    },
    worldAxisSign: { x: 1, y: -1 },
    audit: {
      resolutionMetersPerPixel: Math.max(
        painter.metresPerPixelX,
        painter.metresPerPixelZ
      ),
      ...familyCounts,
      lowerLoopPaintedPixels,
      sourceRouteCount: routes.length,
    },
  };
}

function regionFamily(region: FlowFestCampPlanRegion): FlowFestGroundFamily {
  if (region.kind === "woodland") return "litter";
  if (region.kind === "parking-field") return "packed";
  return "meadow";
}

function paintEllipse(
  painter: GroundMaskPainter,
  region: FlowFestCampPlanRegion,
  family: FlowFestGroundFamily
): void {
  if (!region.center || !region.radiusXMeters || !region.radiusZMeters) return;
  const featherMeters = 5;
  visitWorldBox(
    painter,
    region.center.x - region.radiusXMeters - featherMeters,
    region.center.x + region.radiusXMeters + featherMeters,
    region.center.z - region.radiusZMeters - featherMeters,
    region.center.z + region.radiusZMeters + featherMeters,
    (pixelX, pixelY, worldX, worldZ) => {
      const normalized = Math.hypot(
        (worldX - region.center!.x) / region.radiusXMeters!,
        (worldZ - region.center!.z) / region.radiusZMeters!
      );
      const feather =
        featherMeters / Math.min(region.radiusXMeters!, region.radiusZMeters!);
      const strength = 1 - smoothstep(1 - feather, 1 + feather, normalized);
      if (strength > 0) paintPixel(painter, pixelX, pixelY, family, strength);
    }
  );
}

function paintPolygon(
  painter: GroundMaskPainter,
  region: FlowFestCampPlanRegion,
  family: FlowFestGroundFamily
): void {
  const points = region.points;
  if (!points || points.length < 3) return;
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  visitWorldBox(
    painter,
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...zs),
    Math.max(...zs),
    (pixelX, pixelY, worldX, worldZ) => {
      if (pointInPolygon(worldX, worldZ, points)) {
        paintPixel(painter, pixelX, pixelY, family, 1);
      }
    }
  );
}

function paintCircle(
  painter: GroundMaskPainter,
  centerX: number,
  centerZ: number,
  radiusMeters: number,
  family: FlowFestGroundFamily,
  maximumStrength: number,
  featherMeters: number
): void {
  const extent = radiusMeters + featherMeters;
  visitWorldBox(
    painter,
    centerX - extent,
    centerX + extent,
    centerZ - extent,
    centerZ + extent,
    (pixelX, pixelY, worldX, worldZ) => {
      const distance = Math.hypot(worldX - centerX, worldZ - centerZ);
      const strength =
        (1 - smoothstep(radiusMeters, extent, distance)) * maximumStrength;
      if (strength > 0) paintPixel(painter, pixelX, pixelY, family, strength);
    }
  );
}

function paintRoute(
  painter: GroundMaskPainter,
  route: FlowFestCampPlanLine,
  featherMeters: number
): number {
  const touchedPixels = new Set<number>();
  const coreRadius = route.widthMeters / 2;
  const extent = coreRadius + featherMeters;
  for (let index = 1; index < route.points.length; index += 1) {
    const start = route.points[index - 1]!;
    const end = route.points[index]!;
    visitWorldBox(
      painter,
      Math.min(start.x, end.x) - extent,
      Math.max(start.x, end.x) + extent,
      Math.min(start.z, end.z) - extent,
      Math.max(start.z, end.z) + extent,
      (pixelX, pixelY, worldX, worldZ) => {
        const distance = distanceToSegment(worldX, worldZ, start, end);
        const strength = 1 - smoothstep(coreRadius, extent, distance);
        if (strength <= 0) return;
        paintPixel(painter, pixelX, pixelY, "packed", strength);
        touchedPixels.add(pixelY * painter.width + pixelX);
      }
    );
  }
  return touchedPixels.size;
}

function visitWorldBox(
  painter: GroundMaskPainter,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  visit: (
    pixelX: number,
    pixelY: number,
    worldX: number,
    worldZ: number
  ) => void
): void {
  const firstX = clamp(
    Math.floor((minX - painter.bounds.minX) / painter.metresPerPixelX),
    0,
    painter.width - 1
  );
  const lastX = clamp(
    Math.ceil((maxX - painter.bounds.minX) / painter.metresPerPixelX),
    0,
    painter.width - 1
  );
  const firstY = clamp(
    Math.floor((painter.bounds.maxZ - maxZ) / painter.metresPerPixelZ),
    0,
    painter.height - 1
  );
  const lastY = clamp(
    Math.ceil((painter.bounds.maxZ - minZ) / painter.metresPerPixelZ),
    0,
    painter.height - 1
  );
  for (let pixelY = firstY; pixelY <= lastY; pixelY += 1) {
    const worldZ =
      painter.bounds.maxZ - (pixelY + 0.5) * painter.metresPerPixelZ;
    for (let pixelX = firstX; pixelX <= lastX; pixelX += 1) {
      const worldX =
        painter.bounds.minX + (pixelX + 0.5) * painter.metresPerPixelX;
      visit(pixelX, pixelY, worldX, worldZ);
    }
  }
}

function paintPixel(
  painter: GroundMaskPainter,
  pixelX: number,
  pixelY: number,
  family: FlowFestGroundFamily,
  strength: number
): void {
  const offset = (pixelY * painter.width + pixelX) * 4;
  const target = FAMILY_TARGETS[family];
  const clampedStrength = clamp(strength, 0, 1);
  for (let channel = 0; channel < 3; channel += 1) {
    painter.data[offset + channel] = Math.round(
      painter.data[offset + channel]! * (1 - clampedStrength) +
        target[channel]! * clampedStrength
    );
  }
  painter.data[offset + 3] = 255;
}

function countFamilies(data: Uint8Array): {
  packedPixels: number;
  meadowPixels: number;
  litterPixels: number;
  dampPixels: number;
} {
  const counts = [0, 0, 0, 0];
  for (let offset = 0; offset < data.length; offset += 4) {
    const right = data[offset]!;
    const green = data[offset + 1]!;
    const left = data[offset + 2]!;
    const fourth = Math.max(0, 255 - right - green - left);
    const weights = [right, green, left, fourth];
    let winner = 0;
    for (let index = 1; index < weights.length; index += 1) {
      if (weights[index]! > weights[winner]!) winner = index;
    }
    counts[winner]! += 1;
  }
  return {
    packedPixels: counts[0]!,
    meadowPixels: counts[1]!,
    litterPixels: counts[2]!,
    dampPixels: counts[3]!,
  };
}

function pointInPolygon(
  x: number,
  z: number,
  points: ReadonlyArray<{ x: number; z: number }>
): boolean {
  let inside = false;
  for (
    let current = 0, previous = points.length - 1;
    current < points.length;
    previous = current++
  ) {
    const first = points[current]!;
    const second = points[previous]!;
    if (
      first.z > z !== second.z > z &&
      x <
        ((second.x - first.x) * (z - first.z)) / (second.z - first.z) + first.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToSegment(
  x: number,
  z: number,
  start: { x: number; z: number },
  end: { x: number; z: number }
): number {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  if (lengthSquared === 0) return Math.hypot(x - start.x, z - start.z);
  const progress = clamp(
    ((x - start.x) * deltaX + (z - start.z) * deltaZ) / lengthSquared,
    0,
    1
  );
  return Math.hypot(
    x - (start.x + deltaX * progress),
    z - (start.z + deltaZ * progress)
  );
}

function smoothstep(minimum: number, maximum: number, value: number): number {
  if (minimum === maximum) return value < minimum ? 0 : 1;
  const ratio = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return ratio * ratio * (3 - 2 * ratio);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
