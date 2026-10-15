<script lang="ts">
  import { resolveThrelteScene } from "../../scene-boot/threlte-handles";
  import { useTask, useThrelte } from "@threlte/core";
  import { userProportionsState } from "@austencloud/scene-3d";
  import type { VoidSceneConfig } from "../domain/models/scene-configs";
  import { getSceneFeatureContext } from "../../scene-features/context/scene-feature-context";
  import {
    createVoidEnvironmentWorld,
    type VoidEnvironmentWorld,
  } from "../worlds/void/void-environment-world";

  interface Props {
    config?: VoidSceneConfig;
    stageRadius?: number;
    stageRadiusGrowth?: number;
  }

  let { config, stageRadius = 3, stageRadiusGrowth = 0 }: Props = $props();

  const { scene: sceneValue } = useThrelte();
  const scene = resolveThrelteScene(sceneValue);
  const sceneFeatures = getSceneFeatureContext();
  let world: VoidEnvironmentWorld | null = null;

  $effect(() => {
    const next = createVoidEnvironmentWorld({
      config,
      groundY: userProportionsState.groundY,
      stageRadius,
      stageRadiusGrowth,
    });
    scene.add(next.root);
    world = next;
    sceneFeatures?.reportReady("environment");

    return () => {
      if (world === next) world = null;
      scene.remove(next.root);
      next.dispose();
    };
  });

  useTask((delta) => world?.update(delta));
</script>
