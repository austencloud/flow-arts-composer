import { describe, expect, it } from "vitest";

import {
  getBlossomActiveProductionPhase,
  getBlossomCameraContract,
  getBlossomCirculationPaths,
  getBlossomTerrainBounds,
} from "#lib/shared/3d/environments/scenes/cherry-blossom/blossom-site.js";
import {
  getBlossomPerformanceEnvelope,
  getBlossomStageOperations,
  getBlossomStageProtectedClearance,
} from "#lib/shared/3d/environments/scenes/cherry-blossom/blossom-stage-operations.js";
import {
  getBlossomRiverBounds,
  getBlossomRiverOutline,
  getBlossomRiverShoreFade,
  getBlossomRiverShoreline,
  getBlossomRiverSurfaceElevation,
} from "#lib/shared/3d/environments/scenes/cherry-blossom/blossom-water.js";

describe("Blossom lantern garden production contract", () => {
  it("enables the garden's life and atmosphere", () => {
    expect(getBlossomActiveProductionPhase()).toBe(5);
  });

  it("keeps the validated camera envelope inside the authored terrain", () => {
    const terrain = getBlossomTerrainBounds();
    const camera = getBlossomCameraContract();

    const reach =
      camera.controls.maximumDistance *
        Math.sin((camera.controls.maximumPolarAngleDegrees * Math.PI) / 180) +
      12;
    const pan = camera.controls.panTargetBounds;
    expect(terrain.minX).toBeLessThanOrEqual(pan.minX - reach);
    expect(terrain.maxX).toBeGreaterThanOrEqual(pan.maxX + reach);
    expect(terrain.minY).toBeLessThanOrEqual(pan.minY - reach);
    expect(terrain.maxY).toBeGreaterThanOrEqual(pan.maxY + reach);
  });

  it("authors every public and service route from connected 3D centerlines", () => {
    const paths = getBlossomCirculationPaths();

    expect(paths).toHaveLength(2);
    expect(
      paths.filter((path) => path.kind === "primary-accessible")
    ).toHaveLength(1);
    expect(
      paths.filter((path) => path.kind === "restricted-service")
    ).toHaveLength(1);
    for (const path of paths) {
      expect(path.centerline.length).toBeGreaterThanOrEqual(2);
      expect(path.width).toBeGreaterThanOrEqual(2);
    }
  });

  it("contains the closed pond inside the garden", () => {
    const bounds = getBlossomRiverBounds();
    const terrain = getBlossomTerrainBounds();

    expect(bounds.width).toBeLessThan(terrain.maxX - terrain.minX);
    expect(bounds.depth).toBeGreaterThan(7);
    expect(getBlossomRiverSurfaceElevation()).toBe(-0.16);
  });

  it("carries a resampled bank the pool shader can still measure", () => {
    const outline = getBlossomRiverOutline();
    const shoreline = getBlossomRiverShoreline();

    expect(outline.length).toBeGreaterThan(120);
    expect(outline.length % 2).toBe(0);
    // ReflectivePoolShader's shoreline arrays are fixed at 32 segments; a
    // longer list is silently truncated into an open arc.
    expect(shoreline.length).toBeLessThanOrEqual(32);
    expect(shoreline.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the shore fade narrower than the channel it fringes", () => {
    // The fade is a smoothstep from the bank inward, so a fade wider than the
    // half-width never reaches 1 anywhere on the surface and the deep channel
    // colour simply never appears. At 4.2 m against this 2.7 m half-width the
    // whole river rendered as one flat sheet of the shallow edge colour.
    const halfWidth = 5.4 / 2;

    expect(getBlossomRiverShoreFade()).toBeGreaterThan(0.5);
    expect(getBlossomRiverShoreFade()).toBeLessThan(halfWidth);
  });

  it("centres the water footprint so the shader samples its own shoreline", () => {
    const outline = getBlossomRiverOutline();
    const x = outline.map((point) => point[0]);
    const depth = outline.map((point) => point[1]);

    // ReflectivePool reconstructs shoreline coordinates as (uv - 0.5) * size,
    // which only matches the outline when it is centred on the origin.
    expect(Math.abs(Math.max(...x) + Math.min(...x))).toBeLessThan(0.001);
    expect(Math.abs(Math.max(...depth) + Math.min(...depth))).toBeLessThan(
      0.001
    );
  });

  it("keeps stage operations outside the performance envelope", () => {
    const performance = getBlossomPerformanceEnvelope();
    const clearance = getBlossomStageProtectedClearance();
    const operations = getBlossomStageOperations();

    expect(clearance.minX).toBeLessThan(performance.minX);
    expect(clearance.maxX).toBeGreaterThan(performance.maxX);
    expect(clearance.minY).toBeLessThan(performance.minY);
    expect(clearance.maxY).toBeGreaterThan(performance.maxY);
    expect(operations.backstageStagingArea.minX).toBeGreaterThan(
      clearance.maxX
    );
    expect(operations.propStorageArea.minX).toBeGreaterThan(clearance.maxX);
  });
});
