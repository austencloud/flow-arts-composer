<script lang="ts">
  /**
   * The shared loader for every scene registered by a `scene.json`. It loads
   * the manifest's GLB with the decoders the manifest names, puts it on stage,
   * applies the manifest's fog, backdrop and image lighting, and reports the
   * download to the loading curtain. A scene runtime with dynamic systems
   * (Ocean) wraps this component instead of loading its scenery itself.
   */
  import { T, useThrelte } from "@threlte/core";
  import { untrack } from "svelte";
  import { useDraco, useGltf, useKtx2, useMeshopt } from "@threlte/extras";
  import {
    Color,
    FogExp2,
    type Object3D,
    type Scene,
    type WebGLRenderer,
  } from "three";
  import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
  import { getSceneFeatureContext } from "../../scene-features/context/scene-feature-context";
  import { getRoomEnvironmentTexture } from "../../rendering/room-environment";
  import { foldEnvironmentProgress } from "../registry/environment-manifest";
  import { dressEnvironmentMaterials } from "../registry/environment-materials";
  import type { RegisteredEnvironmentProps } from "../registry/environment-runtimes";

  interface Props extends RegisteredEnvironmentProps {
    /**
     * A second download the scene runtime streams itself. The curtain shows
     * both and lifts only once both have landed.
     */
    companion?: { fraction: number; ready: boolean } | null;
    /** The loaded GLB, for runtimes that adjust its materials. */
    gltf?: GLTF | null;
  }

  let {
    environment,
    active = true,
    companion = null,
    gltf = $bindable(null),
  }: Props = $props();

  const { scene, renderer } = useThrelte() as unknown as {
    scene: Scene;
    renderer: WebGLRenderer;
  };
  const sceneFeatures = getSceneFeatureContext();

  // The manifest never changes for a mounted scene, so the loader is chosen
  // once, at mount, the same way each scene component used to choose it.
  const { glbUrl, compression } = untrack(() => environment);
  const loadedGltf = useGltf(glbUrl, {
    ...(compression.geometry === "meshopt"
      ? { meshoptDecoder: useMeshopt() }
      : {}),
    ...(compression.geometry === "draco"
      ? { dracoLoader: useDraco("/draco/") }
      : {}),
    ...(compression.texture === "ktx2"
      ? { ktx2Loader: useKtx2("/basis/") }
      : {}),
  });

  $effect(() => {
    gltf = $loadedGltf ?? null;
  });

  // What goes on stage: the cached GLB itself, or a dressed copy when the
  // manifest corrects its materials. The copy keeps the cache clean for any
  // other consumer of the same file.
  let shown = $state<Object3D | null>(null);
  $effect(() => {
    const source = $loadedGltf?.scene;
    if (!source) return;
    const { materials, environmentMap } = untrack(() => environment);
    if (!materials) {
      shown = source;
      return;
    }
    const envMap =
      environmentMap === "room" ? getRoomEnvironmentTexture(renderer) : null;
    const dressed = dressEnvironmentMaterials(source, materials, envMap);
    shown = dressed.root;
    return () => {
      shown = null;
      dressed.dispose();
    };
  });

  $effect(() => {
    if (!active) return;
    const { featureKey, requiresAsyncLoad } = environment;
    const progress = foldEnvironmentProgress(
      environment,
      !requiresAsyncLoad || Boolean($loadedGltf),
      companion
    );
    sceneFeatures?.reportProgress(featureKey, progress.fraction);
    if (progress.ready) sceneFeatures?.reportReady(featureKey);
  });

  // Scene globals belong to the active world only; a retained world loading
  // behind it must not repaint the shown one's fog or sky.
  $effect(() => {
    if (!active) return;
    const { fog, background, environmentMap } = environment;
    if (!fog && !background && !environmentMap) return;
    const previous = {
      fog: scene.fog,
      background: scene.background,
      environment: scene.environment,
    };
    if (fog) scene.fog = new FogExp2(fog.color, fog.density);
    if (background) scene.background = new Color(background);
    if (environmentMap === "room") {
      scene.environment = getRoomEnvironmentTexture(renderer);
    }
    return () => {
      scene.fog = previous.fog;
      scene.background = previous.background;
      scene.environment = previous.environment;
    };
  });
</script>

{#if shown}
  <T is={shown} position={environment.offset} dispose={false} />
{/if}
