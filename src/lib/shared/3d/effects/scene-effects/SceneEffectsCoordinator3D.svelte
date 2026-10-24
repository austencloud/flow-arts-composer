<script lang="ts">
  /** Advances all pooled effects once after every rig has published its tips. */
  import { useTask, useThrelte } from "@threlte/core";
  import { usePropEffectStages } from "../prop-effect-stages";
  import { onDestroy } from "svelte";
  import type { Object3D, WebGLRenderer } from "three";
  import {
    NEUTRAL_PETAL_ENVIRONMENT_PROFILE,
    type PetalEnvironmentProfile3D,
  } from "../petals/petal-world-art-direction";
  import type { SceneEffectsManager3D } from "./scene-effects-manager-3d";

  interface Props {
    manager: SceneEffectsManager3D;
    parent?: Object3D;
    petalEnvironmentProfile?: PetalEnvironmentProfile3D;
    onReadyChange?: (ready: boolean) => void;
  }
  let {
    manager,
    parent,
    petalEnvironmentProfile = NEUTRAL_PETAL_ENVIRONMENT_PROFILE,
    onReadyChange,
  }: Props = $props();
  const { scene, renderer } = useThrelte() as unknown as {
    scene: Object3D;
    renderer: WebGLRenderer;
  };
  const { particles: effectsStage } = usePropEffectStages();
  manager.initialize(parent ?? scene, renderer);
  onReadyChange?.(true);

  useTask(
    (delta) => {
      manager.setPetalEnvironmentProfile(petalEnvironmentProfile);
      manager.update(delta);
    },
    { stage: effectsStage }
  );

  onDestroy(() => manager.dispose());
</script>
