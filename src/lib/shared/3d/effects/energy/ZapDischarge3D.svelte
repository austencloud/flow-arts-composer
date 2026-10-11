<script lang="ts">
  /**
   * ZapDischarge3D
   *
   * Mounts the 3D Zap: lightning between the props' ends, drawn by
   * ZapDischarge3D as glowing ribbons in one draw call. A strike bright enough
   * to light the room borrows a light from the scene's shared pool for as long
   * as it flashes; there is no PointLight of its own, so selecting Zap never
   * changes the light count the scene's shaders were compiled for.
   */
  import { T, useTask } from "@threlte/core";
  import { onDestroy } from "svelte";
  import { Color, Vector3, type Object3D } from "three";
  import type { Zap3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";
  import type { LightHandle } from "../lighting/dynamic-light-manager";
  import type { SceneEffectsManager3D } from "../scene-effects/scene-effects-manager-3d";
  import { ZapDischarge3D, type ZapEndpoint3D } from "./zap-discharge-3d";

  interface Props {
    /** Prop ends in rig-local metres; bolts join matching ends of the two props. */
    endpoints: readonly ZapEndpoint3D[];
    params: Zap3DParams;
    /** Whether the effect is live. Stays mounted while off so its shader is warm. */
    enabled?: boolean;
    sceneEffectsManager?: SceneEffectsManager3D | null;
    /** Converts rig-local flash positions into the light pool's world space. */
    lightSpaceRoot?: Object3D;
  }

  let {
    endpoints,
    params,
    enabled = true,
    sceneEffectsManager = null,
    lightSpaceRoot,
  }: Props = $props();

  const discharge = new ZapDischarge3D();
  const lights = new Map<string, LightHandle>();
  const lightPosition = new Vector3();
  const lightColor = new Color();

  function releaseLights(keep: ReadonlySet<string> = new Set()): void {
    const manager = sceneEffectsManager?.getDynamicLightManager();
    for (const [key, handle] of lights) {
      if (keep.has(key)) continue;
      manager?.releaseLight(handle);
      lights.delete(key);
    }
  }

  function updateLights(): void {
    const manager = sceneEffectsManager?.getDynamicLightManager();
    if (!manager || params.lightIntensity <= 0) {
      releaseLights();
      return;
    }
    const lit = new Set<string>();
    for (const flash of discharge.flashes) {
      lit.add(flash.key);
      lightPosition.set(flash.x, flash.y, flash.z);
      lightSpaceRoot?.localToWorld(lightPosition);
      lightColor.set(flash.color);
      const intensity = params.lightIntensity * flash.strength;
      const handle = lights.get(flash.key);
      if (handle) {
        manager.updateLight(handle, lightPosition, intensity, lightColor, 3);
      } else {
        const claimed = manager.requestLight(
          lightPosition,
          lightColor,
          intensity,
          3
        );
        if (claimed) lights.set(flash.key, claimed);
      }
    }
    releaseLights(lit);
  }

  useTask((delta) => {
    if (!enabled) {
      discharge.update(0, params, []);
      releaseLights();
      return;
    }
    discharge.update(delta, params, endpoints);
    updateLights();
  });

  onDestroy(() => {
    releaseLights();
    discharge.dispose();
  });
</script>

<T is={discharge.object} visible={enabled} />
