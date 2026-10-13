/**
 * TKA Promo Animation Preset
 *
 * A single, focused promo video with multiple SHOTS that CUT between angles.
 * Each shot has its own slow pan/zoom, perfect for showcasing different screenshots.
 */

import type { AnimationPreset } from "../domain/promo-models";

const TKA_SHOWCASE_DURATION_SECONDS = 21;

/**
 * TKA Showcase
 *
 * 7 distinct shots with HARD CUTS between them:
 * - Shot 1 (0-3s): Front view, slow zoom in
 * - Shot 2 (3-6s): Right angle, slow pan
 * - Shot 3 (6-9s): Left angle, slow drift
 * - Shot 4 (9-12s): Low angle looking up
 * - Shot 5 (12-15s): High angle looking down
 * - Shot 6 (15-18s): Three-quarter view, zoom out
 * - Shot 7 (18-21s): Hero front shot, gentle drift
 *
 * Total: 21 seconds. Each shot = new screenshot opportunity.
 *
 * IMPORTANT: Keyframes at the SAME TIME create a CUT:
 * - First keyframe at that time = END of previous shot
 * - Second keyframe at that time = START of next shot (instant jump)
 */
export const tkaShowcasePreset: AnimationPreset = {
  id: "tka-showcase",
  name: "TKA Showcase",
  description:
    "7 cinematic shots with cuts - each perfect for a different screenshot",
  duration: TKA_SHOWCASE_DURATION_SECONDS,
  defaultCamera: {
    position: [0, 0, 10],
    lookAt: [0, 0, 0],
    fov: 50,
  },
  defaultDevice: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: 1,
  },
  keyframes: [
    // ===== SHOT 1: Front view, slow zoom in (0-3s) =====
    {
      time: 0,
      camera: { position: [0, 0, 12], lookAt: [0, 0, 0], fov: 50 },
      device: { position: [0, 0, 0], rotation: [0, 0, 0] },
      easing: "sine.inOut",
    },
    {
      time: 0.143, // 3s / 21s
      camera: { position: [0, 0, 9], lookAt: [0, 0, 0], fov: 50 },
      device: { position: [0, 0, 0], rotation: [0, 0, 0] },
      easing: "sine.inOut",
    },

    // ===== CUT to SHOT 2: Right angle, slow pan left (3-6s) =====
    {
      time: 0.143,
      camera: { position: [5, 1, 8], lookAt: [0, 0, 0], fov: 50 },
      device: { position: [0, 0, 0], rotation: [0, -0.3, 0] },
      easing: "sine.inOut",
    },
    {
      time: 0.286, // 6s / 21s
      camera: { position: [2, 0.5, 9], lookAt: [0, 0, 0], fov: 50 },
      device: { position: [0, 0, 0], rotation: [0, -0.15, 0] },
      easing: "sine.inOut",
    },

    // ===== CUT to SHOT 3: Left angle, slow drift right (6-9s) =====
    {
      time: 0.286,
      camera: { position: [-5, 0, 8], lookAt: [0, 0, 0], fov: 50 },
      device: { position: [0, 0, 0], rotation: [0, 0.35, 0] },
      easing: "sine.inOut",
    },
    {
      time: 0.429, // 9s / 21s
      camera: { position: [-2.5, 0.5, 9], lookAt: [0, 0, 0], fov: 50 },
      device: { position: [0, 0, 0], rotation: [0, 0.2, 0] },
      easing: "sine.inOut",
    },

    // ===== CUT to SHOT 4: Low angle looking up, slow rise (9-12s) =====
    {
      time: 0.429,
      camera: { position: [1, -4, 8], lookAt: [0, 0.5, 0], fov: 50 },
      device: { position: [0, 0, 0], rotation: [-0.15, 0, 0] },
      easing: "sine.inOut",
    },
    {
      time: 0.571, // 12s / 21s
      camera: { position: [0, -1, 9], lookAt: [0, 0.2, 0], fov: 50 },
      device: { position: [0, 0, 0], rotation: [-0.05, 0.1, 0] },
      easing: "sine.inOut",
    },

    // ===== CUT to SHOT 5: High angle looking down, slow descent (12-15s) =====
    {
      time: 0.571,
      camera: { position: [-1, 5, 8], lookAt: [0, -0.3, 0], fov: 50 },
      device: { position: [0, 0, 0], rotation: [0.15, -0.1, 0] },
      easing: "sine.inOut",
    },
    {
      time: 0.714, // 15s / 21s
      camera: { position: [0.5, 2, 9], lookAt: [0, 0, 0], fov: 50 },
      device: { position: [0, 0, 0], rotation: [0.05, 0.05, 0] },
      easing: "sine.inOut",
    },

    // ===== CUT to SHOT 6: Three-quarter view, zoom out (15-18s) =====
    {
      time: 0.714,
      camera: { position: [4, 2, 7], lookAt: [0, 0, 0], fov: 50 },
      device: { position: [0, 0, 0], rotation: [0.05, -0.25, 0.03] },
      easing: "sine.inOut",
    },
    {
      time: 0.857, // 18s / 21s
      camera: { position: [3, 1, 10], lookAt: [0, 0, 0], fov: 50 },
      device: { position: [0, 0, 0], rotation: [0, -0.15, 0] },
      easing: "sine.inOut",
    },

    // ===== CUT to SHOT 7: Hero front shot, gentle drift (18-21s) =====
    {
      time: 0.857,
      camera: { position: [1, 0.5, 9], lookAt: [0, 0, 0], fov: 50 },
      device: { position: [0, 0, 0], rotation: [0, 0.1, 0.02] },
      easing: "sine.inOut",
    },
    {
      time: 1,
      camera: { position: [-0.5, 0, 10], lookAt: [0, 0, 0], fov: 50 },
      device: { position: [0, 0, 0], rotation: [-0.02, -0.05, 0] },
      easing: "sine.out",
    },
  ],
};

/**
 * All available presets
 */
export const ANIMATION_PRESETS: AnimationPreset[] = [tkaShowcasePreset];

export function getPresetById(id: string): AnimationPreset | undefined {
  return ANIMATION_PRESETS.find((preset) => preset.id === id);
}

/**
 * Default preset ID
 */
export const DEFAULT_PRESET_ID = "tka-showcase";
