<script lang="ts">
  import { T } from "@threlte/core";
  import { useGltf, useMeshopt } from "@threlte/extras";
  import type { Mesh } from "three";
  import ForestAtmosphereMaterials from "./ForestAtmosphereMaterials.svelte";
  import { getStageDirectionCuesShown } from "../../../context/stage-direction-cues-context";
  import { setStageDirectionCueVisibility } from "../../domain/stage-direction-cues";
  import type { ForestMaterialResponseConfig } from "../../domain/models/scene-configs/forest-scene-config";

  interface Props {
    width: number;
    depth: number;
    groundY: number;
    zOffset?: number;
    materialResponse?: ForestMaterialResponseConfig;
    onReady?: () => void;
    onError?: (error: Error) => void;
  }

  let {
    width,
    depth,
    groundY,
    zOffset = 0,
    materialResponse,
    onReady,
    onError,
  }: Props = $props();

  const BASE_WIDTH = 6;
  const BASE_DEPTH = 6;

  const forestStage = useGltf("/models/forest/forest-stage.glb", {
    meshoptDecoder: useMeshopt(),
  });
  const forestStageError = forestStage.error;

  let readinessReported = $state(false);
  let failureReported = $state(false);

  $effect(() => {
    if (!$forestStage || readinessReported) return;

    $forestStage.scene.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });

    readinessReported = true;
    onReady?.();
  });

  const directionCuesShown = getStageDirectionCuesShown();
  $effect(() => {
    const shown = directionCuesShown();
    if ($forestStage) setStageDirectionCueVisibility($forestStage.scene, shown);
  });

  $effect(() => {
    if (!$forestStageError || failureReported) return;
    failureReported = true;
    onError?.($forestStageError);
  });
</script>

{#if $forestStage}
  <T.Group
    position={[0, groundY, zOffset]}
    scale={[width / BASE_WIDTH, 1, depth / BASE_DEPTH]}
  >
    <T is={$forestStage.scene} dispose={false} />
    {#if materialResponse}
      <ForestAtmosphereMaterials
        scene={$forestStage.scene}
        response={materialResponse}
        scope="stage"
      />
    {/if}
  </T.Group>
{/if}
