<script lang="ts">
  import { T } from "@threlte/core";
  import { layers } from "@threlte/extras";
  import type { Group } from "three";
  import type { Snippet } from "svelte";
  import {
    BASE_SCENE_LAYER,
    PROTECTED_PERFORMER_LAYER,
  } from "../environments/rendering/environment-transition-compositor";

  let {
    ref = $bindable(),
    z = 0,
    children,
  }: {
    ref?: Group;
    z?: number;
    children?: Snippet;
  } = $props();

  // Scope inherited membership to this subtree so scene lighting stays separate.
  layers({ defaultLayers: [BASE_SCENE_LAYER, PROTECTED_PERFORMER_LAYER] });
</script>

<T.Group bind:ref position.z={z}>
  {@render children?.()}
</T.Group>
