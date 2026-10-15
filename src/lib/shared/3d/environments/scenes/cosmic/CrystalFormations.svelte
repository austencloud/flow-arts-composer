<script lang="ts">
  import { T, useTask } from "@threlte/core";
  import { useGltf, useDraco } from "@threlte/extras";
  import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
  import { onDestroy, untrack } from "svelte";
  import {
    InstancedMesh,
    type MeshStandardMaterial,
    type MeshPhysicalMaterial,
  } from "three";
  import {
    extractFromGLB,
    createGLBCrystalInstancedMesh,
    updateCrystalTime,
    disposeCrystalMesh,
    type CrystalPlacement,
    type GLBExtraction,
  } from "./cosmic-instancing";
  import type { CrystalFormationsConfig } from "../../domain/models/scene-configs";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { COSMIC_PLACEMENTS } from "./placements";

  interface Props {
    config: CrystalFormationsConfig;
  }

  let { config }: Props = $props();
  const groundY = $derived(userProportionsState.groundY);

  // ── GLB model loading (top-level, matching Ocean/ReefStructures pattern) ────

  const dracoLoader = useDraco("/draco/");
  const loaderOpts = { dracoLoader, meshoptDecoder: MeshoptDecoder };

  const glb0 = useGltf(config.models[0]?.path ?? "", loaderOpts);
  const glb1 = useGltf(config.models[1]?.path ?? "", loaderOpts);
  const glb2 = useGltf(config.models[2]?.path ?? "", loaderOpts);
  const glb3 = useGltf(config.models[3]?.path ?? "", loaderOpts);
  const glb4 = useGltf(config.models[4]?.path ?? "", loaderOpts);
  const glb5 = useGltf(config.models[5]?.path ?? "", loaderOpts);
  const glb6 = useGltf(config.models[6]?.path ?? "", loaderOpts);

  const allGlbs = $derived(
    [$glb0, $glb1, $glb2, $glb3, $glb4, $glb5, $glb6].filter(Boolean)
  );

  interface MeshData {
    mesh: InstancedMesh;
    material: MeshStandardMaterial | MeshPhysicalMaterial;
  }

  let meshes = $state<MeshData[]>([]);

  function disposeAll(list: MeshData[]) {
    for (const { mesh } of list) disposeCrystalMesh(mesh);
  }

  function objectKeyToModelIndex(key: string): number {
    for (let i = 0; i < config.models.length; i++) {
      const path = config.models[i]!.path;
      const filename = path.split("/").pop()!.replace(".glb", "");
      if (filename === key) return i;
    }
    return -1;
  }

  function seedRng(seed: number) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
  }

  $effect(() => {
    if (!config.enabled || config.models.length === 0) {
      const old = untrack(() => meshes);
      disposeAll(old);
      meshes = [];
      return;
    }

    const readyModels: { index: number; extraction: GLBExtraction }[] = [];
    for (let i = 0; i < allGlbs.length; i++) {
      const gltf = allGlbs[i];
      if (gltf?.scene) {
        const ext = extractFromGLB(gltf.scene);
        if (ext) readyModels.push({ index: i, extraction: ext });
      }
    }

    if (readyModels.length === 0) return;

    const rng = seedRng(config.seed);
    const groups: CrystalPlacement[][] = Array.from(
      { length: readyModels.length },
      () => []
    );
    const groupIds: string[][] = Array.from(
      { length: readyModels.length },
      () => []
    );
    const groupObjectKeys: string[][] = Array.from(
      { length: readyModels.length },
      () => []
    );

    for (const placement of COSMIC_PLACEMENTS) {
      const modelIdx = objectKeyToModelIndex(placement.objectKey);
      if (modelIdx === -1) continue;

      const readyIdx = readyModels.findIndex((rm) => rm.index === modelIdx);
      if (readyIdx === -1) continue;

      const rotY = 2 * Math.atan2(placement.rotation[1], placement.rotation[3]);

      groups[readyIdx]!.push({
        x: placement.position[0],
        y: placement.position[1],
        z: placement.position[2],
        scale: placement.scale[0],
        rotY,
        glowIntensity: 0.5 + rng() * 0.5,
        glowPhase: rng() * Math.PI * 2,
      });
      groupIds[readyIdx]!.push(placement.id);
      groupObjectKeys[readyIdx]!.push(placement.objectKey);
    }

    const newMeshes: MeshData[] = [];
    for (let i = 0; i < readyModels.length; i++) {
      const group = groups[i]!;
      if (group.length === 0) continue;

      const modelCfg = config.models[readyModels[i]!.index]!;
      const glowScaled = group.map((p) => ({
        ...p,
        glowIntensity: p.glowIntensity * modelCfg.glowIntensity,
      }));

      const { mesh, material } = createGLBCrystalInstancedMesh(
        readyModels[i]!.extraction,
        glowScaled
      );
      mesh.userData.composerInstanceIds = groupIds[i];
      mesh.userData.composerInstanceObjectKeys = groupObjectKeys[i];
      mesh.userData.composerInstanceLabels = (groupObjectKeys[i] ?? []).map(
        (key) => key.replaceAll("-", " ")
      );
      newMeshes.push({ mesh, material });
    }

    const old = untrack(() => meshes);
    disposeAll(old);
    meshes = newMeshes;

    return () => disposeAll(newMeshes);
  });

  let time = $state(0);

  useTask((delta) => {
    if (!config.enabled || meshes.length === 0) return;
    time += delta;
    for (const { material } of meshes) {
      updateCrystalTime(material, time);
    }
  });

  onDestroy(() => disposeAll(meshes));

  const glowLights = $derived.by(() => {
    if (!config.enabled) return [];
    const largePlacements = COSMIC_PLACEMENTS.filter(
      (p) => p.scale[0] >= 0.8
    ).slice(0, 8);
    return largePlacements.map((p) => ({
      x: p.position[0],
      z: p.position[2],
      color: "#4488ff",
    }));
  });
</script>

{#if config.enabled}
  {#each meshes as { mesh }}
    <T is={mesh} position.y={groundY} />
  {/each}

  {#each glowLights as light}
    <T.PointLight
      position.x={light.x}
      position.y={groundY + 1.5}
      position.z={light.z}
      color={light.color}
      intensity={4}
      distance={5}
      decay={2}
    />
  {/each}
{/if}
