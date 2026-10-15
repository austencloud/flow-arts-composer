<script lang="ts">
  import { resolveThrelteScene } from "../../scene-boot/threlte-handles";
  /**
   * Led3D - Threlte component for 3D LED effect.
   *
   * Wraps LedRenderer3D with a useTask frame loop. Receives per-LED tip
   * positions and colors from the EffectOrchestrator3D, feeds them to the
   * instanced billboard renderer each frame.
   *
   * Manages a single dynamic point light colored to the dominant LED color
   * (average of all active LEDs), positioned at the centroid of active LEDs.
   */

  import { useTask, useThrelte } from "@threlte/core";
  import { Vector3, Color } from "three";
  import { onDestroy, untrack } from "svelte";
  import { LedRenderer3D, type LedTipInput } from "./led-renderer-3d";
  import type {
    DynamicLightManager,
    LightHandle,
  } from "../lighting/dynamic-light-manager";
  import type { QualityTier } from "../types";
  import type { LedMaterialOptions } from "./led-material-3d";

  interface Props {
    /** Active LED tip positions and colors for this frame */
    tips: LedTipInput[];
    /** Whether the effect is active */
    enabled?: boolean;
    /** Quality tier for trail length and light behavior */
    qualityTier?: QualityTier;
    /** Dynamic light manager for environment interaction */
    lightManager?: DynamicLightManager | null;
    /** Material customization */
    materialOptions?: LedMaterialOptions;
    /** Prop identifier for light coloring */
    propId?: "left" | "right";
  }

  let {
    tips,
    enabled = true,
    qualityTier = "medium" as QualityTier,
    lightManager = null,
    materialOptions,
    propId = "left",
  }: Props = $props();

  const { scene: sceneValue, camera } = useThrelte();
  const scene = resolveThrelteScene(sceneValue);

  const renderer = untrack(() => new LedRenderer3D(qualityTier));
  let initialized = false;
  let lightHandle: LightHandle | null = null;

  // Reusable vectors to avoid allocations
  const centroid = new Vector3();
  const avgColor = new Color();

  useTask(() => {
    if (!enabled || tips.length === 0) {
      if (lightHandle && lightManager) {
        lightManager.releaseLight(lightHandle);
        lightHandle = null;
      }
      if (initialized) {
        renderer.reset();
      }
      return;
    }

    // Lazy-initialize on first frame
    if (!initialized) {
      renderer.initialize(scene, materialOptions);
      initialized = true;
    }

    const cam = camera.current;
    if (!cam) return;

    const now = performance.now() / 1000;
    renderer.update(tips, cam, now);

    // Dynamic point light at LED centroid with average color
    if (lightManager && tips.length > 0) {
      centroid.set(0, 0, 0);
      let totalR = 0;
      let totalG = 0;
      let totalB = 0;

      for (let i = 0; i < tips.length; i++) {
        const tip = tips[i]!;
        centroid.add(tip.position);
        totalR += tip.r;
        totalG += tip.g;
        totalB += tip.b;
      }

      centroid.divideScalar(tips.length);
      avgColor.setRGB(
        totalR / tips.length,
        totalG / tips.length,
        totalB / tips.length
      );

      // Light intensity scales with LED count (more LEDs = brighter room)
      const intensity = Math.min(0.3 + tips.length * 0.05, 1.5);

      if (!lightHandle) {
        lightHandle = lightManager.requestLight(
          centroid,
          avgColor,
          intensity,
          5.0
        );
      } else {
        lightManager.updateLight(lightHandle, centroid, intensity);
      }
    }
  });

  // React to quality tier changes
  $effect(() => {
    renderer.setQualityTier(qualityTier);
  });

  onDestroy(() => {
    if (lightHandle && lightManager) {
      lightManager.releaseLight(lightHandle);
    }
    renderer.dispose();
  });
</script>
