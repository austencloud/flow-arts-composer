<script lang="ts">
  import {
    resolveThrelteRenderer,
    resolveThrelteScene,
  } from "../../../scene-boot/threlte-handles";
  import { useTask, useThrelte } from "@threlte/core";
  import { onMount } from "svelte";
  import {
    RepeatWrapping,
    NoColorSpace,
    SRGBColorSpace,
    TextureLoader,
    Vector2,
    type Mesh,
    type MeshStandardMaterial,
    type Object3D,
    type Texture,
  } from "three";
  import {
    isForestGroundMaterial,
    FOREST_GROUND_DETAIL_TEXTURES,
    getForestGroundDetailFamily,
    patchForestGroundDetailMaterial,
    type ForestGroundDetailFamily,
    type ForestGroundDetailPatch,
  } from "./forest-ground-detail";

  interface Props {
    scene?: Object3D | null;
    strength?: number;
    normalResponse?: number;
    roughnessFloor?: number;
    absoluteColorStrength?: number;
    primaryScale?: number;
    secondaryScale?: number;
    familyMaskTexture?: Texture | null;
    familyMaskPath?: string | null;
    maskOrigin?: readonly [number, number];
    maskSize?: readonly [number, number];
    worldAxisSign?: readonly [number, number];
    targetObjectNamePrefixes?: readonly string[];
    materialFamilyOverride?: ForestGroundDetailFamily | null;
    watchSceneGraph?: boolean;
    includeAncestorScene?: boolean;
    onApplied?: (details: {
      patchedMaterials: number;
      objectNames: string[];
    }) => void;
  }

  let {
    scene = null,
    strength = 0.9,
    normalResponse = 0.3,
    roughnessFloor = 0.98,
    absoluteColorStrength = 0,
    primaryScale = 2.8,
    secondaryScale = 7.4,
    familyMaskTexture = null,
    familyMaskPath = "/textures/forest-floor/forest-floor-family-mask.png",
    maskOrigin = [-200, -200],
    maskSize = [400, 400],
    worldAxisSign = [1, -1],
    targetObjectNamePrefixes = [],
    materialFamilyOverride = null,
    watchSceneGraph = false,
    includeAncestorScene = false,
    onApplied,
  }: Props = $props();
  const { renderer: rendererValue, scene: sceneValue } = useThrelte();
  const renderer = resolveThrelteRenderer(rendererValue);
  const threlteScene = resolveThrelteScene(sceneValue);
  let detailMaps = $state<Partial<Record<ForestGroundDetailFamily, Texture>>>(
    {}
  );
  let loadedFamilyMask = $state<Texture | null>(null);
  let sceneGraphRevision = $state(0);
  let observedTargetCount = -1;

  function resolveSceneScope(): Object3D | null {
    let resolved = scene ?? threlteScene;
    if (!includeAncestorScene) return resolved;
    while (resolved?.parent) resolved = resolved.parent;
    return resolved;
  }

  // Counting target meshes walks the whole scene; four looks a second catch
  // streamed tiles soon enough without paying for that walk every frame.
  let sinceSceneGraphCheck = Infinity;
  useTask((delta) => {
    if (!watchSceneGraph) return;
    sinceSceneGraphCheck += delta;
    if (sinceSceneGraphCheck < 0.25) return;
    sinceSceneGraphCheck = 0;
    const activeScene = resolveSceneScope();
    if (!activeScene) return;
    const targetPrefixes = targetObjectNamePrefixes;
    let targetCount = 0;
    activeScene.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      if (
        targetPrefixes.length > 0 &&
        !targetPrefixes.some((prefix) => mesh.name.startsWith(prefix))
      ) {
        return;
      }
      targetCount += 1;
    });
    if (targetCount === observedTargetCount) return;
    observedTargetCount = targetCount;
    sceneGraphRevision += 1;
  });

  onMount(() => {
    let cancelled = false;
    const loader = new TextureLoader();
    const loadedTextures: Partial<Record<ForestGroundDetailFamily, Texture>> =
      {};
    for (const [family, path] of Object.entries(
      FOREST_GROUND_DETAIL_TEXTURES
    ) as [ForestGroundDetailFamily, string][]) {
      loader.load(
        path,
        (texture) => {
          if (cancelled) {
            texture.dispose();
            return;
          }
          texture.colorSpace = SRGBColorSpace;
          texture.wrapS = RepeatWrapping;
          texture.wrapT = RepeatWrapping;
          texture.anisotropy = Math.min(
            8,
            renderer.capabilities.getMaxAnisotropy()
          );
          texture.needsUpdate = true;
          loadedTextures[family] = texture;
          detailMaps = { ...loadedTextures };
        },
        undefined,
        (error) => {
          console.warn(
            `[ForestGroundDetail] ${family} detail texture failed to load`,
            error
          );
        }
      );
    }
    if (familyMaskPath) {
      loader.load(
        familyMaskPath,
        (texture) => {
          if (cancelled) {
            texture.dispose();
            return;
          }
          texture.colorSpace = NoColorSpace;
          texture.needsUpdate = true;
          loadedFamilyMask = texture;
        },
        undefined,
        (error) => {
          console.warn(
            "[ForestGroundDetail] family mask failed to load",
            error
          );
        }
      );
    }

    return () => {
      cancelled = true;
      for (const texture of Object.values(loadedTextures)) texture?.dispose();
      loadedFamilyMask?.dispose();
      detailMaps = {};
      loadedFamilyMask = null;
    };
  });

  $effect(() => {
    sceneGraphRevision;
    const loadedScene = resolveSceneScope();
    const textures = detailMaps;
    const mask = familyMaskTexture ?? loadedFamilyMask;
    const targetPrefixes = targetObjectNamePrefixes;
    const origin = new Vector2(maskOrigin[0], maskOrigin[1]);
    const size = new Vector2(maskSize[0], maskSize[1]);
    const axisSign = new Vector2(worldAxisSign[0], worldAxisSign[1]);
    const firstAvailableTexture =
      textures.neutral ??
      textures.meadow ??
      textures.litter ??
      textures.damp ??
      null;
    if (!loadedScene || !mask || !firstAvailableTexture) return;
    const progressiveTextures: Record<ForestGroundDetailFamily, Texture> = {
      neutral: textures.neutral ?? firstAvailableTexture,
      meadow: textures.meadow ?? firstAvailableTexture,
      litter: textures.litter ?? firstAvailableTexture,
      damp: textures.damp ?? firstAvailableTexture,
    };

    const patches = new Set<ForestGroundDetailPatch>();
    const objectNames = new Set<string>();
    loadedScene.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      if (
        targetPrefixes.length > 0 &&
        !targetPrefixes.some((prefix) => mesh.name.startsWith(prefix))
      ) {
        return;
      }
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const candidate of materials) {
        const material = candidate as MeshStandardMaterial;
        if (!material.isMeshStandardMaterial) continue;
        if (
          !materialFamilyOverride &&
          (!isForestGroundMaterial(material) ||
            !getForestGroundDetailFamily(material))
        ) {
          continue;
        }
        patches.add(
          patchForestGroundDetailMaterial(
            material,
            progressiveTextures,
            mask,
            strength,
            {
              preserveColor: material.color,
              normalResponse,
              roughnessFloor,
              absoluteColorStrength,
              primaryScale,
              secondaryScale,
              maskOrigin: origin,
              maskSize: size,
              worldAxisSign: axisSign,
            }
          )
        );
        objectNames.add(mesh.name);
      }
    });
    onApplied?.({
      patchedMaterials: patches.size,
      objectNames: [...objectNames],
    });
    return () => {
      for (const patch of patches) patch.dispose();
    };
  });
</script>
