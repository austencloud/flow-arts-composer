import { describe, expect, it } from "vitest";
import {
  OCEAN_ADDED_DEPTH_METERS,
  OCEAN_BASE_WATER_DEPTH_METERS,
  OCEAN_WATER_DEPTH_METERS,
} from "#lib/shared/3d/environments/domain/models/ocean-water-depth.js";
import {
  OCEAN_CAMERA_CEILING_Y,
  OCEAN_WATER_SURFACE_Y,
  clampPresetBelowWater,
} from "#lib/shared/3d/environments/scenes/ocean/ocean-camera-bounds.js";

describe("clampPresetBelowWater", () => {
  it("leaves a preset already below the water plane untouched", () => {
    const preset = {
      position: [0, 4.5, 19] as const,
      target: [0, 1.6, -2] as const,
      fov: 46,
    };
    expect(clampPresetBelowWater(preset)).toEqual(preset);
  });

  it("pulls a preset above the water plane down to the ceiling", () => {
    const clamped = clampPresetBelowWater({
      position: [0, 26, 30] as const,
      target: [0, 0, 0] as const,
      fov: 52,
    });
    expect(clamped.position[1]).toBe(OCEAN_CAMERA_CEILING_Y);
  });

  it("preserves the horizontal position and the fov", () => {
    const clamped = clampPresetBelowWater({
      position: [3, 26, 30] as const,
      target: [0, 0, 0] as const,
      fov: 52,
    });
    expect(clamped.position[0]).toBe(3);
    expect(clamped.position[2]).toBe(30);
    expect(clamped.fov).toBe(52);
  });

  it("clamps the target too, so a clamped camera does not stare upward", () => {
    const clamped = clampPresetBelowWater({
      position: [0, 26, 30] as const,
      target: [0, OCEAN_WATER_SURFACE_Y + 5, 0] as const,
      fov: 52,
    });
    expect(clamped.target[1]).toBe(OCEAN_CAMERA_CEILING_Y);
  });

  it("keeps the ceiling below the runtime water plane", () => {
    expect(OCEAN_CAMERA_CEILING_Y).toBeLessThan(OCEAN_WATER_SURFACE_Y);
  });

  it("moves the deeper waterline another 25 feet away", () => {
    expect(OCEAN_ADDED_DEPTH_METERS).toBeCloseTo(7.62, 8);
    expect(OCEAN_WATER_DEPTH_METERS).toBeCloseTo(
      OCEAN_BASE_WATER_DEPTH_METERS + 7.62,
      8
    );
  });
});
