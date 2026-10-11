import { describe, expect, it } from "vitest";

import { getAutumnQualityConfig } from "#lib/shared/3d/environments/scenes/autumn/quality/autumn-quality.js";
import { AUTUMN_POND_LAYOUT } from "#lib/shared/3d/environments/scenes/autumn/runtime/water/autumn-pond-layout.js";
import {
  allocateAutumnCanopyLeaves,
  allocateAutumnFireflies,
  AUTUMN_FIREFLY_CLUSTERS,
  AUTUMN_LEAF_EMITTERS,
} from "#lib/shared/3d/environments/scenes/autumn/runtime/atmosphere/autumn-ground-life-layout.js";
import { isAutumnGrassTierVisible } from "#lib/shared/3d/environments/scenes/autumn/runtime/wind/autumn-grass-tier.js";

describe("Autumn scene layout", () => {
  it("gives the two capable tiers contact shadows and spares the weakest", () => {
    const high = getAutumnQualityConfig("high");
    const medium = getAutumnQualityConfig("medium");
    const low = getAutumnQualityConfig("low");

    // Shadows were false on every tier, so the configured shadow camera never
    // ran and nothing in the scene had contact. Low stays off because the extra
    // depth pass is the first thing a weak GPU cannot afford.
    expect(high.shadows).toBe(true);
    expect(medium.shadows).toBe(true);
    expect(low.shadows).toBe(false);
    expect(medium.leafCount).toBeLessThan(high.leafCount);
  });

  it("keeps the authored pond outside the protected performance clearing", () => {
    const centerDistance = Math.hypot(
      AUTUMN_POND_LAYOUT.centerX,
      AUTUMN_POND_LAYOUT.centerZ
    );
    const nearestPossibleBank =
      centerDistance -
      Math.max(AUTUMN_POND_LAYOUT.radiusX, AUTUMN_POND_LAYOUT.radiusZ);

    expect(nearestPossibleBank).toBeGreaterThan(6.5);
    expect(AUTUMN_POND_LAYOUT.waterLevelOffset).toBeLessThan(0);
  });

  it("reveals the Blender-authored grass tiers cumulatively", () => {
    expect(isAutumnGrassTierVisible("Autumn_Grass_Base", "low")).toBe(true);
    expect(isAutumnGrassTierVisible("Autumn_Grass_Medium", "low")).toBe(false);
    expect(isAutumnGrassTierVisible("Autumn_Grass_Medium", "medium")).toBe(
      true
    );
    expect(isAutumnGrassTierVisible("Autumn_Grass_High", "high")).toBe(true);
    expect(isAutumnGrassTierVisible("Autumn_Terrain", "high")).toBe(false);
  });

  it("keeps fireflies localized around authored ecology outside the stage", () => {
    const counts = allocateAutumnFireflies(84);
    expect(counts).toHaveLength(AUTUMN_FIREFLY_CLUSTERS.length);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(84);
    expect(counts.every((count) => count > 0)).toBe(true);

    for (const cluster of AUTUMN_FIREFLY_CLUSTERS) {
      expect(Math.hypot(...cluster.position)).toBeGreaterThan(6.5);
    }

    expect(AUTUMN_FIREFLY_CLUSTERS.map((cluster) => cluster.id)).toEqual([
      "clearing-edge",
      "pond",
      "deadwood",
      "champignon-arc",
      "woodland-lane",
    ]);
    expect(AUTUMN_FIREFLY_CLUSTERS[0]?.position[1]).toBeGreaterThan(0);
    expect(AUTUMN_FIREFLY_CLUSTERS.at(-1)?.position[1]).toBeLessThan(-20);
  });

  it("emits every falling leaf beneath an authored tree canopy", () => {
    const counts = allocateAutumnCanopyLeaves(140);
    expect(counts).toHaveLength(AUTUMN_LEAF_EMITTERS.length);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(140);
    expect(counts.every((count) => count > 0)).toBe(true);

    for (const emitter of AUTUMN_LEAF_EMITTERS) {
      expect(Math.hypot(...emitter.position)).toBeGreaterThan(11);
      expect(emitter.area.width).toBeLessThanOrEqual(8.5);
      expect(emitter.area.depth).toBeLessThanOrEqual(7);
      expect(emitter.fallSpeed).toBeGreaterThanOrEqual(0.088);
      expect(emitter.fallSpeed).toBeLessThanOrEqual(0.118);
    }

    expect(AUTUMN_LEAF_EMITTERS.map((emitter) => emitter.position)).toEqual([
      [-12.8, -6.5],
      [14.9, -9.6],
      [-10.4, -16.8],
      [6.2, -18.3],
      [20.4, -14.6],
      [-18.2, 9.2],
    ]);
  });
});
