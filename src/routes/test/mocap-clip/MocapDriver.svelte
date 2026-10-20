<script lang="ts">
  /**
   * MocapDriver — Threlte child that re-poses the character every frame.
   *
   * useTask must run inside the <Canvas> context, and it also keeps the
   * on-demand renderer drawing while the video plays or scrubs.
   */
  import { useTask } from "@threlte/core";

  let { tick }: { tick: () => void } = $props();

  useTask(() => tick());
</script>
