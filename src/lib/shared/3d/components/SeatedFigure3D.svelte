<script lang="ts">
  /**
   * SeatedFigure3D
   *
   * Pulls a pre-baked scene clone + remapped AnimationClip from
   * SeatedAudienceLoader's cache. After SeatedAudience3D.preloadAll
   * has completed, prepareFigure resolves in a microtask and the
   * mixer spins up without any GLB parse, FBX parse, or track remap
   * happening on the main thread during playback.
   */

  import { T, useTask } from "@threlte/core";
  import { onDestroy, onMount } from "svelte";
  import {
    AnimationMixer,
    LoopRepeat,
    type Material,
    type Mesh,
    type Object3D,
  } from "three";
  import { seatedAudienceLoader } from "@austencloud/scene-3d";

  interface Props {
    modelUrl: string;
    animationUrl: string;
    timeOffset?: number;
    /** Reports when the detailed model and sitting clip are both visible. */
    onReady?: () => void;
    /**
     * Fades the figure (0 to 1). The loader's clones share materials with
     * every other seat, so a figure given an opacity takes its own copies.
     */
    opacity?: number;
  }

  const {
    modelUrl,
    animationUrl,
    timeOffset = 0,
    onReady,
    opacity,
  }: Props = $props();

  let ownMaterials: Material[] | null = null;

  function takeOwnMaterials(root: Object3D): Material[] {
    const owned: Material[] = [];
    root.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const copy = (material: Material) => {
        const own = material.clone();
        owned.push(own);
        return own;
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(copy)
        : copy(mesh.material);
    });
    return owned;
  }

  $effect(() => {
    if (!scene || opacity === undefined) return;
    ownMaterials ??= takeOwnMaterials(scene);
    const fading = opacity < 1;
    for (const material of ownMaterials) {
      if (material.transparent !== fading) {
        material.transparent = fading;
        material.needsUpdate = true;
      }
      material.opacity = opacity;
    }
    scene.visible = opacity > 0;
  });

  let scene = $state<Object3D | null>(null);
  let mixer = $state<AnimationMixer | null>(null);

  onMount(() => {
    let cancelled = false;
    seatedAudienceLoader
      .prepareFigure(modelUrl, animationUrl)
      .then((prepared) => {
        if (cancelled) return;
        scene = prepared.scene;
        if (!prepared.clip) {
          console.warn(
            `[SeatedFigure3D] No clip for ${modelUrl} / ${animationUrl}`
          );
          return;
        }
        const m = new AnimationMixer(prepared.scene);
        const action = m.clipAction(prepared.clip);
        action.setLoop(LoopRepeat, Infinity);
        action.play();
        if (timeOffset > 0) m.update(timeOffset);
        mixer = m;
        onReady?.();
      })
      .catch((err) => {
        console.error(`[SeatedFigure3D] prepareFigure failed:`, err);
      });
    return () => {
      cancelled = true;
    };
  });

  useTask((delta) => {
    mixer?.update(delta);
  });

  onDestroy(() => {
    mixer?.stopAllAction();
    for (const material of ownMaterials ?? []) material.dispose();
  });
</script>

{#if scene}
  <T is={scene} />
{/if}
