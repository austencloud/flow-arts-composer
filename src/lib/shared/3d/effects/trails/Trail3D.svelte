<script lang="ts">
  import { T, useTask, useThrelte } from "@threlte/core";
  import { Vector3, Color, type Object3D } from "three";
  import { onDestroy, untrack } from "svelte";
  import { TrailRenderer3D } from "./trail-renderer-3d";
  import type { TrailMode } from "./trail-renderer-3d";
  import type {
    DynamicLightManager,
    LightHandle,
  } from "../lighting/dynamic-light-manager";
  import type { QualityTier } from "../types";
  import { Canvas2DVisibilityFadeManager } from "#lib/shared/animation-engine/services/canvas2d/canvas-2d-visibility-fade-manager.js";
  import type { SceneEffectsManager3D } from "../scene-effects/scene-effects-manager-3d";

  const TRAIL_FADE_IN_MS = 300;
  const TRAIL_FADE_OUT_MS = 200;

  interface Props {
    tipPosition: Vector3 | null;
    color: string;
    propId: "left" | "right";
    width?: number;
    opacity?: number;
    maxPoints?: number;
    rainbow?: boolean;
    enabled?: boolean;
    qualityTier?: QualityTier;
    lightManager?: DynamicLightManager | null;
    /** Scene owner for the one shared, shader-stable light budget. */
    sceneEffectsManager?: SceneEffectsManager3D | null;
    /** Converts rig-local prop tips into the shared light pool's world space. */
    lightSpaceRoot?: Object3D;
    mode?: TrailMode;
    fadeDuration?: number;
    /** HDR core multiplier; >1 so scene bloom (HIGH/MED tier) catches the trail. */
    emissiveStrength?: number;
  }

  let {
    tipPosition,
    color,
    propId,
    width = 0.03,
    opacity = 0.85,
    maxPoints = 120,
    rainbow = false,
    enabled = true,
    qualityTier = "medium" as QualityTier,
    lightManager = null,
    sceneEffectsManager = null,
    lightSpaceRoot,
    mode = "fade" as TrailMode,
    fadeDuration = 2.0,
    emissiveStrength = 2.5,
  }: Props = $props();

  const { camera } = useThrelte();
  const visibilityFade = new Canvas2DVisibilityFadeManager(
    TRAIL_FADE_IN_MS,
    TRAIL_FADE_OUT_MS,
    false
  );
  let fadeClockMs = 0;

  // svelte-ignore state_referenced_locally
  const renderer = new TrailRenderer3D({
    // svelte-ignore state_referenced_locally
    maxPoints,
    // svelte-ignore state_referenced_locally
    width,
    // svelte-ignore state_referenced_locally
    color,
    // svelte-ignore state_referenced_locally
    opacity,
    // svelte-ignore state_referenced_locally
    rainbow,
    // svelte-ignore state_referenced_locally
    qualityTier,
    // svelte-ignore state_referenced_locally
    mode,
    // svelte-ignore state_referenced_locally
    fadeDuration,
    // svelte-ignore state_referenced_locally
    emissiveStrength,
  });
  renderer.setVisibilityAlpha(0);

  // Push live prop changes (thickness/brightness/color/rainbow from the tuning
  // sliders) into the already-constructed renderer. Without this the renderer
  // keeps its construction-time config and the sliders appear to do nothing.
  $effect(() => {
    renderer.updateConfig({ width, opacity, color, rainbow, emissiveStrength });
  });

  $effect(() => {
    visibilityFade.setVisible(enabled);
  });

  let lightHandle: LightHandle | null = null;
  let lightOwner: DynamicLightManager | null = null;
  const lightColor = untrack(
    () => new Color(color === "rainbow" ? "#ffffff" : color)
  );
  const lightPosition = new Vector3();

  useTask((delta) => {
    // Threlte's delta follows both live playback and the synthetic offline
    // render clock. The trail therefore takes the same 300 ms in and 200 ms
    // out regardless of frame rate or export speed.
    fadeClockMs += delta * 1000;
    const visibility = visibilityFade.updateProgress(fadeClockMs);
    renderer.setVisibilityAlpha(visibility.alpha);

    if (enabled && tipPosition) {
      renderer.addPoint(tipPosition);
    }

    const cam = camera.current;
    if (cam && (enabled || visibility.alpha > 0)) {
      renderer.update(cam.position);
    }

    const resolvedLightManager =
      lightManager ?? sceneEffectsManager?.getDynamicLightManager() ?? null;
    if (resolvedLightManager && tipPosition && visibility.alpha > 0) {
      lightPosition.copy(tipPosition);
      lightSpaceRoot?.localToWorld(lightPosition);
      const lightIntensity = 0.5 * visibility.alpha;
      if (!lightHandle) {
        lightHandle = resolvedLightManager.requestLight(
          lightPosition,
          lightColor,
          lightIntensity,
          3.0
        );
        if (lightHandle) lightOwner = resolvedLightManager;
      } else {
        lightOwner?.updateLight(lightHandle, lightPosition, lightIntensity);
      }
    } else if (lightHandle && lightOwner) {
      lightOwner.releaseLight(lightHandle);
      lightHandle = null;
      lightOwner = null;
    }
  });

  onDestroy(() => {
    if (lightHandle && lightOwner) lightOwner.releaseLight(lightHandle);
    renderer.dispose();
  });
</script>

<T is={renderer.object3D} />
