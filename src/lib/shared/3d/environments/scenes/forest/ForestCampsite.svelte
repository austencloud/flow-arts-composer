<script lang="ts">
  import { T } from "@threlte/core";
  import { useGltf, useMeshopt } from "@threlte/extras";
  import type { Mesh, Object3D } from "three";
  import ForestAtmosphereMaterials from "./ForestAtmosphereMaterials.svelte";
  import type { ForestMaterialResponseConfig } from "../../domain/models/scene-configs/forest-scene-config";

  interface Props {
    groundY: number;
    showTents: boolean;
    showCampfire: boolean;
    /**
     * Where the fire pit sits. The pit and its chairs move together, keeping
     * the authored arc; tents stay in their camp pocket. Defaults to the
     * authored spot.
     */
    firePosition?: { x: number; z: number };
    materialResponse?: ForestMaterialResponseConfig;
    onReady?: () => void;
    onError?: (error: Error) => void;
  }

  let {
    groundY,
    showTents,
    showCampfire,
    firePosition,
    materialResponse,
    onReady,
    onError,
  }: Props = $props();

  const campsite = useGltf("/models/forest/forest-campsite.glb", {
    meshoptDecoder: useMeshopt(),
  });
  const campsiteError = campsite.error;
  let readinessReported = $state(false);
  let failureReported = $state(false);

  function applyVisibility(child: Object3D): void {
    const role = child.userData?.tka_role;
    if (role === "tent" || role === "tent-pad") {
      child.visible = showTents;
    } else if (role === "fire-pit" || role === "camp-chair") {
      child.visible = showCampfire;
    }
  }

  $effect(() => {
    if (!$campsite || readinessReported) return;

    $campsite.scene.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });

    readinessReported = true;
    onReady?.();
  });

  $effect(() => {
    if (!$campsite) return;
    $campsite.scene.traverse(applyVisibility);
  });

  // The pit and chairs are top-level nodes, so one shared offset moves the
  // whole circle. Authored spots stay on each node so the move is idempotent.
  $effect(() => {
    if (!$campsite) return;
    const circle = $campsite.scene.children.filter((child) => {
      const role = child.userData?.tka_role;
      return role === "fire-pit" || role === "camp-chair";
    });
    for (const node of circle) {
      node.userData.tkaAuthoredX ??= node.position.x;
      node.userData.tkaAuthoredZ ??= node.position.z;
    }
    const pit = circle.find((node) => node.userData.tka_role === "fire-pit");
    if (!pit) return;
    const dx = firePosition ? firePosition.x - pit.userData.tkaAuthoredX : 0;
    const dz = firePosition ? firePosition.z - pit.userData.tkaAuthoredZ : 0;
    for (const node of circle) {
      node.position.x = node.userData.tkaAuthoredX + dx;
      node.position.z = node.userData.tkaAuthoredZ + dz;
    }
  });

  $effect(() => {
    if (!$campsiteError || failureReported) return;
    failureReported = true;
    onError?.($campsiteError);
  });
</script>

{#if $campsite}
  <T.Group position.y={groundY}>
    <T is={$campsite.scene} dispose={false} />
    {#if materialResponse}
      <ForestAtmosphereMaterials
        scene={$campsite.scene}
        response={materialResponse}
        scope="camp"
      />
    {/if}
  </T.Group>
{/if}
