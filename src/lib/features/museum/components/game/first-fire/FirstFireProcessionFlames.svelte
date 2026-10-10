<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { T, useTask } from "@threlte/core";
  import {
    FirstFireFlameFieldRenderer,
    type FirstFireFlameAnchor,
  } from "#lib/features/museum/services/first-fire-flame-field.js";
  import type { FirstFireFlameGroup } from "#lib/features/museum/data/first-fire-procession-review.js";

  interface Props {
    anchors: readonly FirstFireFlameAnchor[];
    visibleGroups: ReadonlySet<FirstFireFlameGroup>;
    /** Shadow-casting lights along the procession; the museum passes 0 and lights through its pool. */
    pooledLights?: number;
    /** Where the anchors' authoring origin sits in the scene. */
    position?: [number, number, number];
  }

  const props: Props = $props();
  const renderer = new FirstFireFlameFieldRenderer(props.anchors, {
    ...(props.pooledLights !== undefined ? { pooledLights: props.pooledLights } : {}),
  });
  if (props.position) renderer.object3D.position.set(...props.position);
  let motionScale = 1;
  let reducedMotionQuery: MediaQueryList | null = null;

  function syncMotionPreference(): void {
    motionScale = reducedMotionQuery?.matches ? 0.35 : 1;
  }

  $effect(() => {
    renderer.setVisibleGroups(props.visibleGroups);
  });

  onMount(() => {
    reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    syncMotionPreference();
    reducedMotionQuery.addEventListener("change", syncMotionPreference);
  });

  useTask((delta) => {
    renderer.update(delta, motionScale);
  });

  onDestroy(() => {
    reducedMotionQuery?.removeEventListener("change", syncMotionPreference);
    renderer.dispose();
  });
</script>

<T is={renderer.object3D} />
