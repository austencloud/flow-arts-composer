import type { ImportedTerrainDataV2 } from "#lib/shared/3d/procedural-engine/generation/real-terrain-zone.js";
import { sampleFlowFestTerrainWorldY } from "../flow-fest-graybox/flow-fest-terrain-host";
import { FLOW_FEST_ENTRANCE_REFERENCE } from "./flow-fest-entrance-reference";

export interface FlowFestEntranceTerrainAudit {
  adjustedSamples: number;
  maximumAdjustmentMeters: number;
  anchorElevationMeters: number;
  driveSlope: number;
  crossSlope: number;
}

/**
 * Produces the one terrain field used by rendering, collision, dressing, and
 * traversal around the entrance. The broad LiDAR grade remains intact; only
 * short-wavelength DTM noise inside the registered gravel apron is blended to
 * a plane measured from that same DTM.
 */
export function buildFlowFestEntranceGradedTerrain(
  source: ImportedTerrainDataV2
): { terrain: ImportedTerrainDataV2; audit: FlowFestEntranceTerrainAudit } {
  const layout = FLOW_FEST_ENTRANCE_REFERENCE.siteLayout;
  const anchorY = sampleFlowFestTerrainWorldY(
    source,
    layout.entranceWorld.x,
    layout.entranceWorld.z
  );
  const depthNearY = sampleLocal(source, 0, 5);
  const depthFarY = sampleLocal(source, 0, 31);
  const rightLeftY = sampleLocal(source, -15, 10);
  const rightRightY = sampleLocal(source, 15, 10);
  const driveSlope = (depthFarY - depthNearY) / 26;
  const crossSlope = (rightRightY - rightLeftY) / 30;
  const heights = source.heightmap.heights.slice();
  const width = source.heightmap.width;
  const height = source.heightmap.height;
  const spacingX =
    (source.worldBounds.maxX - source.worldBounds.minX) / (width - 1);
  const spacingZ =
    (source.worldBounds.maxZ - source.worldBounds.minZ) / (height - 1);
  let adjustedSamples = 0;
  let maximumAdjustmentMeters = 0;

  for (let row = 0; row < height; row += 1) {
    const z = source.worldBounds.minZ + row * spacingZ;
    for (let column = 0; column < width; column += 1) {
      const x = source.worldBounds.minX + column * spacingX;
      const local = worldToLocal(x, z);
      const depthWeight = windowWeight(local.depth, 2.5, 5, 34, 40);
      const halfWidth = 8.5 + Math.max(0, local.depth - 5) * 0.06;
      const crossWeight =
        1 - smoothstep(halfWidth, halfWidth + 5, Math.abs(local.right));
      const weight = depthWeight * crossWeight;
      if (weight <= 0) continue;

      const index = row * width + column;
      const sourceAbsolute = heights[index]!;
      const targetRelative =
        anchorY + driveSlope * local.depth + crossSlope * local.right;
      const targetAbsolute =
        source.heightmap.verticalOriginMeters + targetRelative;
      const adjusted =
        sourceAbsolute + (targetAbsolute - sourceAbsolute) * weight;
      const adjustment = Math.abs(adjusted - sourceAbsolute);
      if (adjustment > 0.0001) adjustedSamples += 1;
      maximumAdjustmentMeters = Math.max(maximumAdjustmentMeters, adjustment);
      heights[index] = adjusted;
    }
  }

  return {
    terrain: {
      ...source,
      heightmap: {
        ...source.heightmap,
        heights,
      },
    },
    audit: {
      adjustedSamples,
      maximumAdjustmentMeters,
      anchorElevationMeters: anchorY,
      driveSlope,
      crossSlope,
    },
  };

  function sampleLocal(
    terrain: ImportedTerrainDataV2,
    right: number,
    depth: number
  ): number {
    const point = {
      x:
        layout.entranceWorld.x +
        layout.driveRightUnit.x * right +
        layout.driveInwardUnit.x * depth,
      z:
        layout.entranceWorld.z +
        layout.driveRightUnit.z * right +
        layout.driveInwardUnit.z * depth,
    };
    return sampleFlowFestTerrainWorldY(terrain, point.x, point.z);
  }

  function worldToLocal(
    x: number,
    z: number
  ): { right: number; depth: number } {
    const dx = x - layout.entranceWorld.x;
    const dz = z - layout.entranceWorld.z;
    return {
      right: dx * layout.driveRightUnit.x + dz * layout.driveRightUnit.z,
      depth: dx * layout.driveInwardUnit.x + dz * layout.driveInwardUnit.z,
    };
  }
}

function windowWeight(
  value: number,
  outerStart: number,
  innerStart: number,
  innerEnd: number,
  outerEnd: number
): number {
  return (
    smoothstep(outerStart, innerStart, value) *
    (1 - smoothstep(innerEnd, outerEnd, value))
  );
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const ratio = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return ratio * ratio * (3 - 2 * ratio);
}
