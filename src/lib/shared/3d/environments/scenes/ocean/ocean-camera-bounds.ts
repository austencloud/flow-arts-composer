import { OCEAN_WATER_DEPTH_METERS } from "#lib/shared/3d/environments/domain/models/ocean-water-depth.js";

/**
 * Ocean camera bounds.
 *
 * The ocean scene is deliberately bounded underwater — there is no sky and no
 * surface break, so a camera that rises above the water plane at y = +22.12
 * looks up into geometry that was never authored. Clamping keeps every framing
 * inside the world the scene actually builds.
 *
 * This clamps PRESETS rather than the live camera, so the shared
 * EnvironmentReviewCamera (used by four other scenes) stays untouched.
 *
 * Design: docs/superpowers/specs/active/2026-08-09-fathom-ocean-world-boundary-design.md
 */

const OCEAN_SEABED_Y = -1.5;
export const OCEAN_WATER_SURFACE_Y = OCEAN_SEABED_Y + OCEAN_WATER_DEPTH_METERS;

/** Keeps every preset at least 60 cm below the runtime water plane. */
export const OCEAN_CAMERA_CEILING_Y = OCEAN_WATER_SURFACE_Y - 0.6;

export interface CameraPreset {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fov: number;
}

/**
 * Returns the preset unchanged when it already sits below the ceiling, so an
 * unclamped preset keeps its exact identity.
 */
export function clampPresetBelowWater(preset: CameraPreset): CameraPreset {
  const positionAbove = preset.position[1] > OCEAN_CAMERA_CEILING_Y;
  const targetAbove = preset.target[1] > OCEAN_CAMERA_CEILING_Y;
  if (!positionAbove && !targetAbove) return preset;

  return {
    ...preset,
    position: [
      preset.position[0],
      Math.min(preset.position[1], OCEAN_CAMERA_CEILING_Y),
      preset.position[2],
    ],
    // The target is clamped too: pulling the eye down while leaving the target
    // above the surface just tilts the camera up at the same unauthored space.
    target: [
      preset.target[0],
      Math.min(preset.target[1], OCEAN_CAMERA_CEILING_Y),
      preset.target[2],
    ],
  };
}
