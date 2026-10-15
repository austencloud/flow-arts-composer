<script lang="ts">
  import { resolveThrelteScene } from "../../../scene-boot/threlte-handles";
  import { useTask, useThrelte } from "@threlte/core";
  import { tryGetAdaptiveQualityContext } from "../../../context/adaptive-quality-context";
  import type { HemisphereLightConfig } from "../../domain/models/scene-configs/shared-scene-config";
  import type { ForestLightingConfig } from "../../domain/models/scene-configs/forest-scene-config";
  import {
    createForestLightingRig,
    type ForestLightingRig,
  } from "../../worlds/forest/forest-lighting-rig";

  interface Props {
    hemisphere: HemisphereLightConfig;
    profile?: ForestLightingConfig;
    groundY?: number;
    anchor?: { x: number; y: number; z: number };
    shadowExtentMeters?: number;
    keyLightDistanceMeters?: number;
    shadowAnchorSnapMeters?: number;
    shadowRefreshIntervalSeconds?: number;
    shadowRefreshMinimumFrameGap?: number;
    shadowMapSize?: number;
    shadowRefreshToken?: string | number;
  }

  let {
    hemisphere,
    profile,
    groundY = 0,
    anchor = { x: 0, y: groundY, z: 0 },
    shadowExtentMeters,
    keyLightDistanceMeters = 64,
    shadowAnchorSnapMeters = 0,
    shadowRefreshIntervalSeconds = 0,
    shadowRefreshMinimumFrameGap = 0,
    shadowMapSize = 2048,
    shadowRefreshToken = 0,
  }: Props = $props();

  const { scene: sceneValue } = useThrelte();
  const scene = resolveThrelteScene(sceneValue);
  const adaptiveQuality = tryGetAdaptiveQualityContext();
  let rig: ForestLightingRig | null = null;

  $effect(() => {
    void shadowRefreshToken;
    const next = createForestLightingRig({
      hemisphere,
      profile,
      groundY,
      anchor,
      shadowExtentMeters,
      keyLightDistanceMeters,
      shadowAnchorSnapMeters,
      shadowRefreshIntervalSeconds,
      shadowRefreshMinimumFrameGap,
      shadowMapSize,
      shadowsEnabled: adaptiveQuality?.config.enableShadows ?? true,
    });
    scene.add(next.object);
    rig = next;
    return () => {
      if (rig === next) rig = null;
      scene.remove(next.object);
      next.dispose();
    };
  });

  useTask((delta) => rig?.update(delta));
</script>
