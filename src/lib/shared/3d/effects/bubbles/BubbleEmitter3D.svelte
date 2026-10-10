<script lang="ts">
  /**
   * Fallback per-tip host for the canonical instanced bubble renderer.
   *
   * Most 3D scenes batch every tip through SceneEffectsManager3D. Hosts that
   * do not provide that coordinator still get the same soap-film shader,
   * motion, scale, and pop behavior here instead of a second Svelte-mesh
   * implementation drifting away from production.
   */
  import { T, useTask } from "@threlte/core";
  import { onDestroy } from "svelte";
  import type { Object3D, Vector3 } from "three";
  import type { Bubbles3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";
  import type { BubbleTipSource3D } from "../scene-effects/scene-effect-source-3d";
  import { QualityTier } from "../types";
  import { BubbleRenderer3D } from "./bubble-renderer-3d";

  interface Props {
    /** World-space position of this tip. null = hidden. */
    position: Vector3 | null;
    /** Tip velocity in metres per second. */
    propVelocity: Vector3;
    /** Resolved bubble params (palette + rates + rise speed). */
    params: Bubbles3DParams;
    /** Gates emission while existing film finishes naturally. */
    enabled: boolean;
    /** Stable renderer capability tier for bubble density and optics. */
    qualityTier?: QualityTier;
  }

  let {
    position,
    propVelocity,
    params,
    enabled,
    qualityTier = QualityTier.MEDIUM,
  }: Props = $props();
  let root = $state<Object3D>();
  const renderer = new BubbleRenderer3D();
  const source: BubbleTipSource3D = {
    effect: "bubbles",
    sourceId: 1,
    propIndex: 0,
    tipIndex: 0,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    speed: 0,
    currentStep: 0,
    propColor: "#ffffff",
    params,
    qualityTier,
  };
  const liveSources: readonly BubbleTipSource3D[] = [source];
  const idleSources: readonly BubbleTipSource3D[] = [];

  $effect(() => {
    if (root) renderer.initialize(root);
  });

  useTask((delta) => {
    source.params = params;
    source.qualityTier = qualityTier;
    source.speed = propVelocity.length();
    source.velocity.x = propVelocity.x;
    source.velocity.y = propVelocity.y;
    source.velocity.z = propVelocity.z;
    if (position) {
      source.position.x = position.x;
      source.position.y = position.y;
      source.position.z = position.z;
    }
    renderer.update(enabled && position ? liveSources : idleSources, delta);
  });

  onDestroy(() => renderer.dispose());
</script>

<T.Group bind:ref={root} />
