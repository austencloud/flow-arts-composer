<script lang="ts">
  /**
   * Paints the props of the performer this sits inside in that performer's
   * own colors (see `performer-prop-tint.ts`). Mounted beside a PerformerRig,
   * under the performer's group. Runs every frame because a prop can rebuild
   * its meshes (a prop swap, a palette change) at any time.
   */
  import { useParentObject3D, useTask } from "@threlte/core";
  import { onDestroy } from "svelte";
  import {
    createPerformerPropTint,
    type PerformerPropColors,
  } from "../rendering/performer-prop-tint";

  let { colors }: { colors: PerformerPropColors | null } = $props();

  const parent = useParentObject3D();
  const tint = createPerformerPropTint();

  // Runs on the frames the scene renders anyway; tinting never asks for one.
  useTask(
    () => {
      const root = $parent;
      if (root) tint.apply(root, colors);
    },
    { autoInvalidate: false }
  );

  onDestroy(() => tint.dispose());
</script>
